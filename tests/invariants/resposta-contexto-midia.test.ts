import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { GOV_AGENT_A, seedGov } from "./gov-helpers";
import { replyFixture } from "../support/autonomia-fixture";

const pool = new pg.Pool({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${process.env.TEST_DB_PORT ?? 54329}/postgres`,
  max: 6,
});
beforeAll(() => seedGov());
afterAll(() => pool.end());
type Fixture = Awaited<ReturnType<typeof replyFixture>>;

async function message(f: Fixture, direction = "inbound", imported = false) {
  const id = randomUUID();
  await pool.query(
    `insert into messages(id,organization_id,conversation_id,contact_id,channel_session_id,
      direction,type,status,external_id,metadata)
     values($1,$2,$3,$4,$5,$6,'audio','received',$7,$8)`,
    [id, f.org, f.conversation, f.contact, f.channel, direction, randomUUID(),
      imported ? { historico_importado: "true" } : {}],
  );
  return id;
}

async function begin(f: Fixture) {
  return (await pool.query("select * from fn_reply_begin($1,$2,$3,$4,$5)",
    [f.org, f.conversation, f.agent, f.version, randomUUID()])).rows[0];
}

async function pending(f: Fixture, status = "pending") {
  const draft = await begin(f);
  await pool.query(
    "update ai_reply_drafts set status=$3,original_body='Repita por texto' where organization_id=$1 and id=$2",
    [f.org, draft.id, status],
  );
  return draft;
}

async function derive(f: Fixture, id: string, text = "Quero falar com o Yuri") {
  await pool.query(
    "update messages set media_derived_status='ready',media_derived_text=$3 where organization_id=$1 and id=$2",
    [f.org, id, text],
  );
}

async function revision(f: Fixture) {
  return BigInt((await pool.query(
    "select reply_context_revision from conversations where organization_id=$1 and id=$2",
    [f.org, f.conversation],
  )).rows[0].reply_context_revision);
}

async function current(f: Fixture, id: string) {
  return (await pool.query("select fn_reply_context_current($1,$2) as current", [f.org, id])).rows[0].current;
}

it("transcrição concluída invalida a sugestão e permite gerar outra no mesmo atendimento", async () => {
  const f = await replyFixture(pool), id = await message(f), draft = await pending(f);
  const before = await revision(f);
  await derive(f, id);
  expect(await current(f, draft.id)).toBe(false);
  expect(await revision(f)).toBe(before + 1n);
  const next = await begin(f);
  expect(next.id).not.toBe(draft.id);
  expect(next.status).toBe("generating");
  expect(next.service_boundary).toEqual(draft.service_boundary);
});

it("aprovação antiga é recusada depois que a fala do áudio entra no contexto", async () => {
  const f = await replyFixture(pool), id = await message(f), draft = await pending(f);
  await derive(f, id);
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local role authenticated");
    await client.query("select set_config('request.jwt.claims',$1,true)", [
      JSON.stringify({ sub: GOV_AGENT_A, role: "authenticated", aal: "aal1" }),
    ]);
    await expect(client.query("select fn_reply_action($1,$2,$3,'approve','Repita por texto',null)",
      [f.org, draft.id, String(draft.revision)])).rejects.toThrow("reply_stale");
  } finally {
    await client.query("rollback");
    client.release();
  }
  expect((await pool.query("select id from job_queue where organization_id=$1 and kind='approved_reply'", [f.org])).rows).toEqual([]);
});

it("sugestão descartada não impede outra quando a transcrição muda", async () => {
  const f = await replyFixture(pool), id = await message(f), draft = await pending(f, "dismissed");
  await derive(f, id);
  expect((await begin(f)).id).not.toBe(draft.id);
});

it("repetir o mesmo derivado não invalida a nova sugestão nem despacha trabalho", async () => {
  const f = await replyFixture(pool), id = await message(f);
  await derive(f, id);
  const draft = await pending(f), before = await revision(f);
  const jobs = (await pool.query("select id from job_queue where organization_id=$1", [f.org])).rows;
  await derive(f, id);
  expect(await revision(f)).toBe(before);
  expect(await current(f, draft.id)).toBe(true);
  expect((await pool.query("select id from job_queue where organization_id=$1", [f.org])).rows).toEqual(jobs);
});

it("mudança de status terminal sem texto também invalida o contexto", async () => {
  const f = await replyFixture(pool), id = await message(f), draft = await pending(f);
  await pool.query("update messages set media_derived_status='failed' where organization_id=$1 and id=$2", [f.org, id]);
  expect(await current(f, draft.id)).toBe(false);
});

it("atualização de outra organização não invalida a sugestão desta organização", async () => {
  const one = await replyFixture(pool), two = await replyFixture(pool);
  const id = await message(two), draft = await pending(one), before = await revision(one);
  await derive(two, id);
  expect(await revision(one)).toBe(before);
  expect(await current(one, draft.id)).toBe(true);
});

it.each(["outbound", "historico"])("derivado de %s preserva a revisão do atendimento", async (kind) => {
  const f = await replyFixture(pool);
  const id = await message(f, kind === "outbound" ? "outbound" : "inbound", kind === "historico");
  const draft = await pending(f), before = await revision(f);
  await derive(f, id);
  expect(await revision(f)).toBe(before);
  expect(await current(f, draft.id)).toBe(true);
});

const migration = readFileSync(
  "supabase/migrations/20261113235000_9367_resposta_contexto_midia.sql", "utf8",
);

async function legacyDraft(status: string) {
  const f = await replyFixture(pool), id = await message(f);
  await derive(f, id);
  const draft = await pending(f, status);
  // Reconstroi a ordem historica: mensagem, sugestao, derivacao sem invalidacao.
  await pool.query("update messages set created_at=now()-interval '2 minutes' where id=$1", [id]);
  await pool.query("update ai_reply_drafts set created_at=now()-interval '1 minute' where id=$1", [draft.id]);
  return { f, draft };
}

it("atualização recupera sugestão legada descartada uma vez e preserva a próxima", async () => {
  const { f, draft } = await legacyDraft("dismissed");
  const before = await revision(f);
  await pool.query(migration);
  expect(await revision(f)).toBe(before + 1n);
  expect(await current(f, draft.id)).toBe(false);
  const next = await pending(f);
  expect(next.id).not.toBe(draft.id);
  await pool.query(migration);
  expect(await revision(f)).toBe(before + 1n);
  expect(await current(f, next.id)).toBe(true);
  expect((await pool.query("select status from ai_reply_drafts where id=$1", [draft.id])).rows[0].status).toBe("dismissed");
});

it("atualização preserva resposta legada já enviada", async () => {
  const { f, draft } = await legacyDraft("sent");
  const before = await revision(f);
  await pool.query(migration);
  expect(await revision(f)).toBe(before);
  expect((await pool.query("select status from ai_reply_drafts where id=$1", [draft.id])).rows[0].status).toBe("sent");
});
