/**
 * Liga a ferramenta nativa de handoff ao worker real de distribuição.
 * Banco descartável e identidades sintéticas; não chama LLM nem transporte.
 * Diferente do teste do roteador, a passagem não é simulada por um UPDATE.
 */
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { applyRequestHumanHandoff, isLeadInHandoff } from "@/lib/agent-engine/agent/human-handoff";
import { runRoutingWorker } from "@/lib/routing/worker";
import { createAdminClient } from "@/lib/supabase/admin";

import { routingPgSupabase } from "../support/routing-pg-supabase";
import {
  GOV_AGENT_A as responsavel, GOV_AGENT_B as outro, GOV_CONTACT_1 as contato,
  GOV_CONV_UNASSIGNED as conversa, GOV_MANAGER as gestor, GOV_ORG as org,
  GOV_SESSION as canal, seedGov,
} from "./gov-helpers";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const novoPool = () => new Pool({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${process.env.TEST_DB_PORT}/postgres`,
  max: 5,
});
let pool = novoPool();
const query = (text: string, args: unknown[] = []) => pool.query(text, args);
const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as
  Parameters<typeof applyRequestHumanHandoff>[2]["log"];
const fala = "Minha loja vende móveis. Quero conversar com o responsável sobre orçamento.";
const fetchBloqueado = vi.fn(() => { throw new Error("Este teste não pode acessar a rede"); });

async function comoGestor(text: string, args: unknown[]) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local role authenticated");
    await client.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: gestor, aal: "aal1" })]);
    await client.query(text, args);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally { client.release(); }
}

async function rodar() {
  const adapter = routingPgSupabase(pool);
  vi.mocked(createAdminClient).mockReturnValue(adapter.client as never);
  const result = await runRoutingWorker({ now: new Date(Date.now() + 5_000) });
  expect(adapter.errors).toEqual([]);
  return result;
}

async function passar() {
  const result = await applyRequestHumanHandoff(pool, {
    tenantId: org, leadId: contato, conversationId: conversa,
  }, {
    conversationSummary: fala,
    contextoDoTurno: { pendentesDoCliente: [fala] },
    avisoAoLead: { avisado: false, porque: "Transporte desabilitado neste teste" }, log,
  }, { motivo_codigo: "requested_human", por_que: "Pedido de orçamento", cliente_quer: "Falar com o responsável" });
  expect(result).toMatchObject({ ok: true, status: "handoff_solicitado" });
  return result;
}

async function estado() {
  return (await query(`select v.assigned_to_user_id, v.assignee_kind,
      v.bot_silenced_until::text as silencio, c.force_human
      from conversations v join contacts c on c.id=v.contact_id
      where v.organization_id=$1 and v.id=$2`, [org, conversa])).rows[0];
}

beforeAll(() => seedGov());
afterAll(() => pool.end());
afterEach(() => { expect(fetchBloqueado).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });

beforeEach(async () => {
  fetchBloqueado.mockClear();
  vi.stubGlobal("fetch", fetchBloqueado);
  await query("delete from ai_agents where organization_id=$1", [org]);
  await query("delete from ai_agent_versions where organization_id=$1", [org]);
  await query("delete from channel_routing_policies where organization_id=$1", [org]);
  await query("delete from agent_cases where organization_id=$1", [org]);
  await query("delete from agent_inbox_items where organization_id=$1", [org]);
  await query("delete from passagens_de_atendimento where organization_id=$1", [org]);
  // O seed compartilhado tem outra conversa aberta. A mudança de disponibilidade
  // acorda todas; este cenário mede exatamente a conversa qualificada abaixo.
  await query("update conversations set status='closed' where organization_id=$1 and id<>$2 and status='open'", [org, conversa]);
  await query("update contacts set force_human=false, ai_opt_out=false where organization_id=$1 and id=$2", [org, contato]);
  await query(`update conversations set assigned_to_user_id=null, assigned_to_user_name=null,
    assigned_at=null, assignee_kind=null, status='open', last_handoff_at=null,
    bot_silenced_until=null, metadata='{}' where organization_id=$1 and id=$2`, [org, conversa]);
  await query(`insert into attendant_availability (organization_id,user_id,is_available,capacity,schedule)
    values ($1,$2,true,5,'{}'), ($1,$3,true,5,'{}') on conflict (organization_id,user_id)
    do update set is_available=true, capacity=5, schedule='{}'`, [org, responsavel, outro]);
  await comoGestor("select fn_set_channel_routing($1,$2,$3,false,'round_robin',null)", [org, canal, [responsavel]]);
  await comoGestor("select fn_set_channel_ai_wait($1,$2,30)", [org, canal]);
  const agente = (await query(`insert into ai_agents (organization_id,name,system_prompt,kind)
    values ($1,'Qualificador sintético','Qualifique e passe para humano.','rag_bot') returning id`, [org])).rows[0].id;
  const versao = (await query(`insert into ai_agent_versions
    (organization_id,agent_id,version_number,system_prompt,provider,model,channel_session_id,status,published_at)
    values ($1,$2,1,'Qualifique e passe para humano.','openai','gpt-5.6-terra',$3,'published',now()) returning id`,
    [org, agente, canal])).rows[0].id;
  await query("update ai_agents set published_version_id=$1 where id=$2", [versao, agente]);
  await query("delete from event_log where organization_id=$1 and event_type='conversation.routing_requested'", [org]);
  await query("select fn_request_channel_routing($1,$2)", [org, conversa]);
});

describe("qualificação → handoff nativo → responsável único", () => {
  it.each([true, false])("agente em rascunho/pausado não finge qualificação; responsável disponível=%s", async (disponivel) => {
    await query("update ai_agents set published_version_id=null, paused_at=now() where organization_id=$1", [org]);
    await query("update ai_agent_versions set status='draft', published_at=null where organization_id=$1", [org]);
    await query("update attendant_availability set is_available=$3 where organization_id=$1 and user_id=$2", [org, responsavel, disponivel]);
    const result = await rodar();
    expect(result.outcomes.waiting_ia_qualificando).toBe(0);
    expect(result.outcomes.assigned).toBe(disponivel ? 1 : 0);
    expect((await estado()).assigned_to_user_id).toBe(disponivel ? responsavel : null);
  });

  it("espera qualificar; entrega o contexto e pausa ao responsável após a ferramenta real", async () => {
    expect((await rodar()).outcomes.waiting_ia_qualificando).toBe(1);
    expect((await estado()).assigned_to_user_id).toBeNull();
    const result = await passar();
    expect(result).toMatchObject({ message: expect.stringContaining("não foi possível avisar") });
    expect((await rodar()).outcomes.assigned).toBe(1);
    expect(await estado()).toMatchObject({ assigned_to_user_id: responsavel, assignee_kind: "user", force_human: true, silencio: "infinity" });
    expect(await isLeadInHandoff(pool, org, contato)).toBe(true);
    const passagem = await query("select body, notes from passagens_de_atendimento where organization_id=$1 and conversation_id=$2", [org, conversa]);
    expect(passagem.rows).toHaveLength(1);
    expect(JSON.stringify(passagem.rows[0])).toContain(fala);
    const avisos = await query("select count(*)::int as n from agent_inbox_items where organization_id=$1 and ref_id=$2 and kind='handoff'", [org, conversa]);
    expect(avisos.rows[0].n).toBe(1);
  });

  it("preserva dono e silêncio após reprocessamento e reconexão do worker", async () => {
    await rodar(); await passar();
    expect((await rodar()).outcomes.assigned).toBe(1);
    await pool.end(); pool = novoPool();
    const novamente = await rodar();
    expect(novamente.outcomes.assigned).toBe(0);
    expect(await estado()).toMatchObject({ assigned_to_user_id: responsavel, force_human: true, silencio: "infinity" });
    expect(await isLeadInHandoff(pool, org, contato)).toBe(true);
  });

  it("sem responsável disponível fica na fila, sem entregar a outro membro; volta quando ele se declara disponível", async () => {
    await rodar();
    await query("update attendant_availability set is_available=false where organization_id=$1 and user_id=$2", [org, responsavel]);
    await passar();
    expect((await rodar()).outcomes.assigned).toBe(0);
    expect(await estado()).toMatchObject({ assigned_to_user_id: null, force_human: true, silencio: "infinity" });
    await query("update attendant_availability set is_available=true where organization_id=$1 and user_id=$2", [org, responsavel]);
    expect((await rodar()).outcomes.assigned).toBe(1);
    expect((await estado()).assigned_to_user_id).toBe(responsavel);
  });
});
