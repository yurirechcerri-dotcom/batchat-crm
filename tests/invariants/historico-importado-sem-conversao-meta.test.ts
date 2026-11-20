import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import {
  GOV_CONTACT_1,
  GOV_CONV_UNASSIGNED,
  GOV_ORG,
  GOV_SESSION,
  seedGov,
  sql,
} from "./gov-helpers";

beforeAll(seedGov);

const historicalId = "c12c0000-0000-4000-8000-000000000001";
const liveId = "c12c0000-0000-4000-8000-000000000002";
const clid = "historico-sem-conversao-meta";

function message(id: string, historicoImportado?: boolean | string) {
  const metadata = JSON.stringify({
    meta_ctwa_message_v1: {
      platform: "meta_ads",
      source_type: "ad",
      ctwa_clid: clid,
    },
    ...(historicoImportado === undefined ? {} : { historico_importado: historicoImportado }),
  });
  return `insert into public.messages
    (id,organization_id,contact_id,conversation_id,channel_session_id,
      external_id,type,direction,status,metadata)
    values ('${id}','${GOV_ORG}','${GOV_CONTACT_1}','${GOV_CONV_UNASSIGNED}',
      '${GOV_SESSION}','${id}','text','inbound','received','${metadata}'::jsonb);`;
}

describe("historico importado nao captura conversao Meta", () => {
  it.each([true, "true"])("marca %j conserva a mensagem sem reservar o clique", (marca) => {
    const out = sql(`begin;
      select public.fn_definir_meta_lead_birth('${GOV_ORG}',true);
      ${message(historicalId, marca)}
      select 'historico=' || count(*) from public.messages where id='${historicalId}';
      select 'antes=' || count(*) from public.meta_ctwa_click_dispatches
        where organization_id='${GOV_ORG}' and ctwa_clid='${clid}';
      ${message(liveId)}
      select 'depois=' || count(*) || ':' || bool_and(
        first_message_id='${liveId}' and status='pending')
        from public.meta_ctwa_click_dispatches
        where organization_id='${GOV_ORG}' and ctwa_clid='${clid}';
      rollback;`);
    expect(out).toContain("historico=1");
    expect(out).toContain("antes=0");
    expect(out).toContain("depois=1:true");
  });

  it.each([false, "false", undefined])("controle vivo %j continua capturando o clique", (marca) => {
    const out = sql(`begin;
      select public.fn_definir_meta_lead_birth('${GOV_ORG}',true);
      ${message(liveId, marca)}
      select 'vivo=' || count(*) || ':' || bool_and(
        first_message_id='${liveId}' and status='pending')
        from public.meta_ctwa_click_dispatches
        where organization_id='${GOV_ORG}' and ctwa_clid='${clid}';
      rollback;`);
    expect(out).toContain("vivo=1:true");
  });

  it("reaplicar a migration preserva despacho existente e mantem historico silencioso", () => {
    const migration = readFileSync(
      "supabase/migrations/20261113103619_9348_historico_sem_conversao_meta.sql",
      "utf8",
    );
    const snapshot = `select 'snapshot=' || row_to_json(d)::text
      from public.meta_ctwa_click_dispatches d
      where organization_id='${GOV_ORG}' and ctwa_clid='${clid}';`;
    const out = sql(`begin;
      select public.fn_definir_meta_lead_birth('${GOV_ORG}',true);
      ${message(liveId)}
      ${snapshot}
      ${migration}
      ${migration}
      ${message(historicalId, true)}
      ${snapshot}
      select 'total=' || count(*) from public.meta_ctwa_click_dispatches
        where organization_id='${GOV_ORG}' and ctwa_clid='${clid}';
      rollback;`);
    const snapshots = out.split("\n").filter((line) => line.startsWith("snapshot="));
    expect(snapshots).toHaveLength(2);
    expect(snapshots[1]).toBe(snapshots[0]);
    expect(out).toContain("total=1");
  });
});
