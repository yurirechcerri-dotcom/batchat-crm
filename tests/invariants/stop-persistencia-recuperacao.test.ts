/**
 * Ingestor/parser/pós-entrada reais e SQL real pelo adapter do harness.
 * A falha é injetada por trigger no PostgreSQL descartável, nunca pelo client.
 * Prova escrita, unique e retomada após reconexão; não prova arquivo aceito,
 * cron, HTTP PostgREST/RLS, reinício de processo ou envios já em voo.
 * Efeitos de negócio são observadores; nenhum worker/LLM/transporte executa.
 */
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ingestZernioInbound } from "@/lib/channels/zernio/ingest";
import { aplicarOptOutPendente } from "@/lib/channels/pos-entrada";
import { routingPgSupabase } from "../support/routing-pg-supabase";
import {
  GOV_CONTACT_1 as contato, GOV_CONV_UNASSIGNED as conversa,
  GOV_ORG as org, GOV_SESSION as canal, seedGov,
} from "./gov-helpers";

const efeitos = vi.hoisted(() => ({
  demanda: vi.fn(async () => ({ criado: false, motivo: "fixture" })),
  campanha: vi.fn(async () => undefined),
  followup: vi.fn(async () => undefined),
  dreno: vi.fn(async () => undefined),
  auditoria: vi.fn(async (_input: Record<string, unknown>) => undefined),
  origem: vi.fn(async () => undefined),
}));
vi.mock("@/lib/audit", () => ({ audit: efeitos.auditoria }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => { throw new Error("Use somente o adapter PostgreSQL descartável"); },
}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/leads/nascimento-do-lead", () => ({ garantirLeadDaConversa: efeitos.demanda }));
vi.mock("@/lib/leads/origem-por-horario", () => ({ casarOrigemPorHorario: efeitos.origem }));
vi.mock("@/lib/ai/elegibilidade/autorizacao", () => ({ autorizarContatoParaIA: efeitos.campanha }));
vi.mock("@/lib/ai/elegibilidade/campanha", () => ({
  lerCampanhas: () => [{ id: "campanha-sintetica" }],
  casarCampanha: () => ({ id: "campanha-sintetica" }),
}));
vi.mock("@/lib/dev/kick-local-pipeline", () => ({
  acelerarFollowupDoInbound: efeitos.followup, drenarEventosDoInbound: efeitos.dreno,
  acelerarPipelineDeEventos: vi.fn(), kickLocalPipeline: vi.fn(),
}));
vi.mock("@/lib/channels/desativado", () => ({ idsDosCanaisDesativados: async () => [] }));
vi.mock("@/lib/contacts/contato-pessoal", () => ({
  lerPessoalDoContato: async () => ({ pessoal: false, erro: null }),
}));
vi.mock("@/lib/modulos/desvios-da-entrada", () => ({ moduloQueAssumeAEntrada: async () => null }));
vi.mock("@/lib/escalacao/numero-interno-de-aviso", () => ({ ehContatoDoNumeroInterno: async () => false }));
vi.mock("@/lib/escalacao/resposta-whatsapp-ao-caso", () => ({ consumirRespostaDoSuporteNoWhatsApp: async () => false }));
vi.mock("@/lib/plataformas-de-anuncio/google/atribuicao", () => ({ extrairEEstamparAtribuicaoGoogle: async () => undefined }));
vi.mock("@/lib/channels/marcar-conversa", () => ({ marcarConversaComMensagem: async () => undefined }));

const porta = process.env.TEST_DB_PORT;
if (!process.env.TEST_DB_CONTAINER || !porta || !/^\d+$/.test(porta)) {
  throw new Error("Execute somente pelo harness pnpm test:db, com porta descartável explícita");
}
const novoPool = () => new Pool({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${porta}/postgres`, max: 2,
});
let pool = novoPool();
let adapter = routingPgSupabase(pool);
const query = (text: string, args: unknown[] = []) => pool.query(text, args);
const EXTERNAL = "wamid.stop-pg-sintetico";
const THREAD = "thread-stop-pg-sintetica";
const HORA = "2026-11-13T10:00:00.000Z";
const VIZINHO = {
  org: "dd570000-0000-4000-8000-000000000001", contato: "dd570000-0000-4000-8000-000000000002",
  canal: "dd570000-0000-4000-8000-000000000003", conversa: "dd570000-0000-4000-8000-000000000004",
};
let vizinhoAntes: unknown;
const rede = vi.fn(() => { throw new Error("Rede externa proibida neste invariante"); });
const auditoriasDeBloqueio = () => efeitos.auditoria.mock.calls.filter(([a]) => a.action === "contact.blocked");
const codigosDoBanco = () => adapter.errors.map(e => (e as { code?: string }).code);

function ingerir(texto = "PARAR", retomada = false) {
  return ingestZernioInbound(adapter.client, {
    organizationId: org, channelSessionId: canal, retomada,
    payload: {
      id: "evento-stop-pg-sintetico", event: "message.received", account: { id: "conta-sintetica" },
      message: {
        id: "mensagem-provedor-sintetica", conversationId: THREAD, platform: "whatsapp",
        platformMessageId: EXTERNAL, direction: "incoming", text: texto, attachments: [], sentAt: HORA,
        sender: { phoneNumber: "+5511999990001", name: "Contato sintético" },
      },
    },
  });
}
async function estado() {
  return (await query(`select c.is_blocked, c.blocked_reason, c.blocked_at,
    (select count(*)::int from messages where organization_id=$1 and external_id=$3) as mensagens,
    (select count(*)::int from event_log where organization_id=$1
      and event_type='ai_agent.dispatch_requested') as despachos
    from contacts c where c.organization_id=$1 and c.id=$2`, [org, contato, EXTERNAL])).rows[0];
}
async function estadoVizinho() {
  return (await query(`select
    (select to_jsonb(c) from contacts c where c.organization_id=$1 and c.id=$2) as contato,
    (select to_jsonb(v) from conversations v where v.organization_id=$1 and v.id=$3) as conversa,
    (select jsonb_agg(to_jsonb(m) order by m.id) from messages m where m.organization_id=$1) as mensagens`,
  [VIZINHO.org, VIZINHO.contato, VIZINHO.conversa])).rows[0];
}
async function inserirHistorica(organizationId: string, contactId: string, conversationId: string, sessionId: string, marca: boolean | string) {
  await query(`insert into messages (organization_id,contact_id,conversation_id,channel_session_id,
    external_id,direction,sent_via,status,type,body,sent_at,metadata)
    values ($1,$2,$3,$4,$5,'inbound','external_device','delivered','text','PARAR',$6,$7)`,
  [organizationId, contactId, conversationId, sessionId, EXTERNAL, HORA, JSON.stringify({ historico_importado: marca })]);
}
async function modo(valor: "erro" | "zero_linhas" | "normal") {
  await query("update test_db.stop_pg_falha set modo=$1", [valor]);
}
async function reconectar() {
  await pool.end(); pool = novoPool(); adapter = routingPgSupabase(pool);
}
function semEfeitosPosteriores() {
  for (const efeito of [efeitos.demanda, efeitos.campanha, efeitos.followup, efeitos.dreno, efeitos.origem]) {
    expect(efeito).not.toHaveBeenCalled();
  }
  expect(auditoriasDeBloqueio()).toHaveLength(0);
}

beforeAll(async () => {
  seedGov();
  // Recibo do harness obrigatório antes de instalar qualquer instrumento.
  expect((await query("select count(*)::int as n from test_db.aplicacoes_do_baseline")).rows[0].n).toBeGreaterThan(0);
  await query(`create table test_db.stop_pg_falha (modo text not null);
    insert into test_db.stop_pg_falha values ('normal');
    create function test_db.stop_pg_interromper() returns trigger language plpgsql as $$
    declare modo_atual text;
    begin
      if new.id::text=TG_ARGV[0] and new.is_blocked then
        select modo into modo_atual from test_db.stop_pg_falha;
        if modo_atual='erro' then
          raise exception 'STOP: falha transitória injetada' using errcode='57014';
        elsif modo_atual='zero_linhas' then return null;
        end if;
      end if;
      return new;
    end $$;`);
  await query(`create trigger stop_pg_interromper before update of is_blocked on contacts
    for each row execute function test_db.stop_pg_interromper('${contato}')`);
  await query(`insert into organizations (id,slug,legal_name,display_name)
    values ($1,'stop-pg-vizinho','Vizinho sintético','Vizinho sintético')`, [VIZINHO.org]);
  await query(`insert into contacts (id,organization_id,display_name,phone_number)
    values ($1,$2,'Vizinho sintético','+5511999990001')`, [VIZINHO.contato, VIZINHO.org]);
  await query(`insert into channel_sessions (id,organization_id,waha_session_name,webhook_secret_encrypted)
    values ($1,$2,'stop-pg-vizinho',decode('00','hex'))`, [VIZINHO.canal, VIZINHO.org]);
  await query(`insert into conversations (id,organization_id,contact_id,channel_session_id,status,provider_conversation_id)
    values ($1,$2,$3,$4,'open',$5)`, [VIZINHO.conversa, VIZINHO.org, VIZINHO.contato, VIZINHO.canal, THREAD]);
  // Mesmo external_id/thread/telefone em outra organização, com marca histórica.
  // Uma leitura sem escopo passaria a ignorar a mensagem viva do tenant principal.
  await inserirHistorica(VIZINHO.org, VIZINHO.contato, VIZINHO.conversa, VIZINHO.canal, true);
  vizinhoAntes = await estadoVizinho();
});
beforeEach(async () => {
  vi.clearAllMocks(); vi.stubGlobal("fetch", rede);
  adapter = routingPgSupabase(pool);
  await modo("normal");
  await query("delete from messages where organization_id=$1 and external_id=$2", [org, EXTERNAL]);
  await query(`update contacts set is_blocked=false, blocked_reason=null, blocked_at=null,
    ai_authorized_at=null, phone_number='+5511999990001' where organization_id=$1 and id=$2`, [org, contato]);
  await query("update conversations set provider_conversation_id=$3,last_inbound_at=$4 where organization_id=$1 and id=$2",
    [org, conversa, THREAD, HORA]);
  await query(`update channel_sessions set metadata=coalesce(metadata,'{}') || '{"ai_gate":"allowlist"}'::jsonb
    where organization_id=$1 and id=$2`, [org, canal]);
  await query("delete from event_log where organization_id=$1", [org]);
});
afterEach(async () => {
  try {
    expect(rede).not.toHaveBeenCalled();
    expect(await estadoVizinho()).toEqual(vizinhoAntes);
  } finally { vi.unstubAllGlobals(); }
});
afterAll(async () => {
  try {
    await query("drop trigger if exists stop_pg_interromper on contacts");
    await query("drop function if exists test_db.stop_pg_interromper()");
    await query("drop table if exists test_db.stop_pg_falha");
  } finally { await pool.end(); }
});

describe("STOP Zernio: persistência e retomada no PostgreSQL", () => {
  it.each(["erro", "zero_linhas"] as const)("resgate pendente recusa %s e bloqueia quando a escrita volta", async falha => {
    const pedido = {
      organizationId: org, contactId: contato, conversationId: conversa,
      texto: "PARAR", origem: "resgate_sintetico",
    };
    await modo(falha);
    await expect(aplicarOptOutPendente(adapter.client, pedido)).rejects.toMatchObject({ name: "OptOutPendenteError" });
    expect(await estado()).toMatchObject({ is_blocked: false, mensagens: 0, despachos: 0 });
    expect(auditoriasDeBloqueio()).toHaveLength(0);
    expect(codigosDoBanco()).toEqual(falha === "erro" ? ["57014"] : []);
    await modo("normal");
    await reconectar();
    await aplicarOptOutPendente(adapter.client, pedido);
    expect(await estado()).toMatchObject({ is_blocked: true, blocked_reason: "stop_keyword", mensagens: 0, despachos: 0 });
    expect(auditoriasDeBloqueio()).toHaveLength(1);
    expect(codigosDoBanco()).toEqual([]);
  });

  it.each(["erro", "zero_linhas"] as const)("%s impede efeitos e retoma a mesma identidade após reconexão", async falha => {
    await modo(falha);
    await expect(ingerir()).rejects.toMatchObject({ name: "OptOutPendenteError" });
    expect(await estado()).toMatchObject({ is_blocked: false, blocked_at: null, mensagens: 1, despachos: 0 });
    semEfeitosPosteriores();
    expect(codigosDoBanco()).toEqual(falha === "erro" ? ["57014"] : []);
    const primeira = (await query("select id,sent_at,body from messages where organization_id=$1 and external_id=$2", [org, EXTERNAL])).rows;

    await reconectar();
    await expect(ingerir("PARAR", true)).rejects.toMatchObject({ name: "OptOutPendenteError" });
    expect(await estado()).toMatchObject({ is_blocked: false, mensagens: 1, despachos: 0 });
    semEfeitosPosteriores();
    expect(codigosDoBanco()).toEqual(falha === "erro" ? ["23505", "57014"] : ["23505"]);

    await modo("normal");
    await reconectar();
    expect(await ingerir("PARAR", true)).toMatchObject({ status: "duplicate", reason: "efeitos_retomados" });
    expect(await estado()).toMatchObject({ is_blocked: true, blocked_reason: "stop_keyword", mensagens: 1, despachos: 1 });
    expect((await estado()).blocked_at).not.toBeNull();
    expect(auditoriasDeBloqueio()).toHaveLength(1);
    for (const efeito of [efeitos.demanda, efeitos.campanha, efeitos.followup, efeitos.dreno]) expect(efeito).toHaveBeenCalledTimes(1);

    const bloqueado = await estado();
    expect(await ingerir("PARAR", true)).toMatchObject({ status: "duplicate" });
    expect(await estado()).toEqual(bloqueado);
    expect(auditoriasDeBloqueio()).toHaveLength(1);
    for (const efeito of [efeitos.demanda, efeitos.campanha, efeitos.followup, efeitos.dreno]) expect(efeito).toHaveBeenCalledTimes(1);
    expect((await query("select id,sent_at,body from messages where organization_id=$1 and external_id=$2", [org, EXTERNAL])).rows).toEqual(primeira);
    expect(codigosDoBanco()).toEqual(["23505", "23505"]);
  });

  it.each([true, "true"])("histórico %j não aplica STOP nem efeitos", async marca => {
    await inserirHistorica(org, contato, conversa, canal, marca);
    await modo("erro");
    for (const retomada of [false, true]) {
      expect(await ingerir("PARAR", retomada)).toMatchObject({ status: "duplicate", reason: "historico_importado" });
    }
    expect(await estado()).toMatchObject({ is_blocked: false, mensagens: 1, despachos: 0 });
    semEfeitosPosteriores();
    expect(codigosDoBanco()).toEqual([]);
  });

  it("mensagem comum segue viva sem duplicar despacho após reconexão", async () => {
    await modo("erro");
    expect(await ingerir("Olá, quero conhecer o atendimento")).toMatchObject({ status: "ingested" });
    expect(await estado()).toMatchObject({ is_blocked: false, mensagens: 1, despachos: 1 });
    expect(codigosDoBanco()).toEqual([]);
    await reconectar();
    expect(await ingerir("Olá, quero conhecer o atendimento", true)).toMatchObject({ status: "duplicate" });
    expect(await estado()).toMatchObject({ is_blocked: false, mensagens: 1, despachos: 1 });
    for (const efeito of [efeitos.demanda, efeitos.campanha, efeitos.followup, efeitos.dreno]) expect(efeito).toHaveBeenCalledTimes(1);
    expect(auditoriasDeBloqueio()).toHaveLength(0);
    expect(codigosDoBanco()).toEqual(["23505"]);
  });
});
