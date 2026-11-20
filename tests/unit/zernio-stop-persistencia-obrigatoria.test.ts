import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Parser, ingestZernioInbound, pós-entrada e detector de STOP REAIS.
 * O fake aplica filtros, grava linhas e reproduz unique(org, external_id).
 * Prova interrupção/retomada do mesmo evento EM MEMÓRIA. Não prova arquivo
 * durável, cron, reinício de processo, RLS, transporte ou bloqueio de envio.
 * Os efeitos de negócio são observadores; nenhuma chamada externa é permitida.
 */
const efeitos = vi.hoisted(() => ({
  demanda: vi.fn(async () => ({ criado: false, motivo: "fixture" })),
  campanha: vi.fn(async () => undefined),
  followup: vi.fn(async () => undefined),
  dreno: vi.fn(async () => undefined),
  auditoria: vi.fn(async (_input: Record<string, unknown>) => undefined),
  origem: vi.fn(async () => undefined),
}));

vi.mock("@/lib/audit", () => ({ audit: efeitos.auditoria }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/leads/nascimento-do-lead", () => ({ garantirLeadDaConversa: efeitos.demanda }));
vi.mock("@/lib/leads/origem-por-horario", () => ({ casarOrigemPorHorario: efeitos.origem }));
vi.mock("@/lib/ai/elegibilidade/autorizacao", () => ({ autorizarContatoParaIA: efeitos.campanha }));
vi.mock("@/lib/ai/elegibilidade/campanha", () => ({
  lerCampanhas: () => [{ id: "campanha-sintetica" }],
  casarCampanha: () => ({ id: "campanha-sintetica" }),
}));
vi.mock("@/lib/dev/kick-local-pipeline", () => ({
  acelerarFollowupDoInbound: efeitos.followup,
  drenarEventosDoInbound: efeitos.dreno,
  acelerarPipelineDeEventos: vi.fn(),
  kickLocalPipeline: vi.fn(),
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

import { ingestZernioInbound } from "@/lib/channels/zernio/ingest";

type Linha = Record<string, unknown>;
type Falha = "erro" | "zero_linhas" | null;
const ORG = "org-stop-sintetica";
const CANAL = "sessao-stop-sintetica";
const CONTATO = "contato-stop-sintetico";
const CONVERSA = "conversa-stop-sintetica";
const EXTERNAL = "wamid.stop-sintetico";
const HORA = "2026-11-13T10:00:00.000Z";
let tabelas: Record<string, Linha[]>;
let falha: Falha;
let tentativasDeBloqueio: number;
let naoModelados: string[];
const rede = vi.fn(() => { throw new Error("Rede proibida neste teste"); });

function consulta(tabela: string) {
  const filtros: Array<(linha: Linha) => boolean> = [];
  let operacao: "select" | "insert" | "update" = "select";
  let patch: Linha = {};
  let representacao = false;
  let limite = Infinity;
  const executar = () => {
    const linhas = tabelas[tabela];
    if (!linhas) {
      naoModelados.push(tabela);
      throw new Error(`Tabela não modelada: ${tabela}`);
    }
    if (operacao === "insert") {
      if (tabela !== "messages") {
        naoModelados.push(`insert:${tabela}`);
        throw new Error(`INSERT não modelado: ${tabela}`);
      }
      if (linhas.some(l => l.organization_id === patch.organization_id && l.external_id === patch.external_id)) {
        return { data: null, error: { code: "23505", message: "unique org/external_id" } };
      }
      const nova = { id: `mensagem-${linhas.length + 1}`, ...patch };
      linhas.push(nova);
      return { data: representacao ? [{ ...nova }] : null, error: null };
    }
    const alvo = linhas.filter(l => filtros.every(f => f(l))).slice(0, limite);
    if (operacao === "update") {
      if (tabela === "contacts" && patch.is_blocked === true) {
        tentativasDeBloqueio += 1;
        if (falha === "erro") return { data: null, error: { code: "57014", message: "statement timeout sintético" } };
        // Resposta válida do PostgREST sem escrita efetiva, mesmo sem erro.
        if (falha === "zero_linhas") return { data: representacao ? [] : null, error: null };
      }
      alvo.forEach(l => Object.assign(l, patch));
      return { data: representacao ? alvo.map(l => ({ ...l })) : null, error: null };
    }
    return { data: alvo.map(l => ({ ...l })), error: null };
  };
  const q: Record<string, unknown> = {
    select: (_colunas?: string) => { representacao = true; return q; },
    insert: (linha: Linha) => { operacao = "insert"; patch = linha; return q; },
    update: (campos: Linha) => { operacao = "update"; patch = campos; return q; },
    eq: (coluna: string, valor: unknown) => { filtros.push(l => l[coluna] === valor); return q; },
    is: (coluna: string, valor: unknown) => { filtros.push(l => (l[coluna] ?? null) === valor); return q; },
    in: (coluna: string, valores: unknown[]) => { filtros.push(l => valores.includes(l[coluna])); return q; },
    limit: (n: number) => { limite = n; return q; },
    maybeSingle: async () => {
      const r = executar();
      if (r.data && r.data.length > 1) throw new Error("maybeSingle recebeu várias linhas");
      return { data: r.data?.[0] ?? null, error: r.error };
    },
    then: (resolve: (r: ReturnType<typeof executar>) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve().then(executar).then(resolve, reject),
  };
  return q;
}

const admin = {
  from: consulta,
  rpc: async (nome: string, args: Linha) => {
    if (nome !== "emit_event") {
      naoModelados.push(`rpc:${nome}`);
      throw new Error(`RPC não modelada: ${nome}`);
    }
    tabelas.event_log!.push({
      id: `evento-${tabelas.event_log!.length + 1}`,
      organization_id: args.p_organization_id,
      entity_kind: args.p_entity_kind,
      entity_id: args.p_entity_id,
      event_type: args.p_event_type,
    });
    return { data: null, error: null };
  },
} as unknown as SupabaseClient;

function evento(texto = "PARAR") {
  return {
    id: "evento-stop-sintetico", event: "message.received", account: { id: "conta-sintetica" },
    message: {
      id: "mensagem-provedor-sintetica", conversationId: "thread-stop-sintetica",
      platform: "whatsapp", platformMessageId: EXTERNAL, direction: "incoming",
      text: texto, attachments: [], sentAt: HORA,
      sender: { phoneNumber: "+5511999990001", name: "Contato sintético" },
    },
  };
}
const ingerir = (texto = "PARAR", retomada = false) => ingestZernioInbound(admin, {
  organizationId: ORG, channelSessionId: CANAL, payload: evento(texto), retomada,
});
const contato = () => tabelas.contacts!.find(l => l.id === CONTATO)!;
const despachos = () => tabelas.event_log!.filter(l => l.event_type === "ai_agent.dispatch_requested");
const efeitosPosteriores = () => ({
  demanda: efeitos.demanda.mock.calls.length, campanha: efeitos.campanha.mock.calls.length,
  followup: efeitos.followup.mock.calls.length, dreno: efeitos.dreno.mock.calls.length,
  despachos: despachos().length,
});
const SEM_EFEITOS = { demanda: 0, campanha: 0, followup: 0, dreno: 0, despachos: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", rede);
  falha = null;
  tentativasDeBloqueio = 0;
  naoModelados = [];
  tabelas = {
    contacts: [
      { id: CONTATO, organization_id: ORG, is_blocked: false, phone_number: "+5511999990001" },
      { id: "vizinho", organization_id: "outra-org", is_blocked: false },
    ],
    conversations: [{ id: CONVERSA, organization_id: ORG, contact_id: CONTATO,
      channel_session_id: CANAL, provider_conversation_id: "thread-stop-sintetica", last_inbound_at: HORA }],
    channel_sessions: [{ id: CANAL, organization_id: ORG, provider: "zernio", metadata: { ai_gate: "allowlist" } }],
    organizations: [{ id: ORG, settings: {} }],
    messages: [], event_log: [], crm_leads: [], demandas: [],
  };
});
afterEach(() => {
  vi.unstubAllGlobals();
  expect(rede).not.toHaveBeenCalled();
  expect(naoModelados).toEqual([]);
  expect(tabelas.contacts!.find(l => l.id === "vizinho")?.is_blocked).toBe(false);
});

describe("WhatsApp Zernio: STOP exige escrita antes dos efeitos", () => {
  it.each(["erro", "zero_linhas"] as const)("%s interrompe e permite retomar a mesma mensagem", async modo => {
    falha = modo;
    const primeira = await ingerir().then(resultado => resultado, erro => erro as unknown);
    // Soft permite observar também a retomada no RED, sem fabricar o estado
    // que uma ingestão correta teria deixado (não apagamos despachos indevidos).
    expect.soft(primeira).toBeInstanceOf(Error);
    expect.soft(primeira).toMatchObject({ name: "OptOutPendenteError" });
    expect.soft(tentativasDeBloqueio).toBe(1);
    expect.soft(contato().is_blocked).toBe(false);
    expect.soft(tabelas.messages).toHaveLength(1);
    expect.soft(efeitosPosteriores()).toEqual(SEM_EFEITOS);
    expect.soft(efeitos.auditoria.mock.calls.filter(([a]) => a.action === "contact.blocked")).toHaveLength(0);

    falha = null;
    const retomada = await ingerir("PARAR", true);
    expect(retomada).toMatchObject({ status: "duplicate", reason: "efeitos_retomados" });
    expect(contato().is_blocked).toBe(true);
    expect(tentativasDeBloqueio).toBe(2);
    expect(tabelas.messages).toHaveLength(1);
    expect(despachos().length).toBeLessThanOrEqual(1);
    expect(efeitos.auditoria.mock.calls.filter(([a]) => a.action === "contact.blocked")).toHaveLength(1);
  });

  it.each([true, "true"])("STOP histórico %j continua sem bloquear ou pedir efeitos", async marca => {
    tabelas.messages!.push({ id: "historica", organization_id: ORG, external_id: EXTERNAL,
      channel_session_id: CANAL, conversation_id: CONVERSA, contact_id: CONTATO,
      direction: "inbound", sent_at: HORA, body: "PARAR", metadata: { historico_importado: marca } });
    for (const retomada of [false, true]) {
      expect(await ingerir("PARAR", retomada)).toMatchObject({ status: "duplicate", reason: "historico_importado" });
    }
    expect(contato().is_blocked).toBe(false);
    expect(tentativasDeBloqueio).toBe(0);
    expect(efeitosPosteriores()).toEqual(SEM_EFEITOS);
    expect(tabelas.messages).toHaveLength(1);
  });

  it("mensagem comum segue o caminho vivo e duplicata não pede segundo despacho", async () => {
    expect(await ingerir("Olá, quero conhecer o atendimento")).toMatchObject({ status: "ingested" });
    expect(tentativasDeBloqueio).toBe(0);
    expect(contato().is_blocked).toBe(false);
    expect(efeitos.demanda).toHaveBeenCalledTimes(1);
    expect(efeitos.campanha).toHaveBeenCalledTimes(1);
    expect(efeitos.followup).toHaveBeenCalledTimes(1);
    expect(despachos()).toHaveLength(1);
    const antes = efeitosPosteriores();
    expect(await ingerir("Olá, quero conhecer o atendimento", true)).toMatchObject({ status: "duplicate" });
    expect(efeitosPosteriores()).toEqual(antes);
    expect(tabelas.messages).toHaveLength(1);
  });
});
