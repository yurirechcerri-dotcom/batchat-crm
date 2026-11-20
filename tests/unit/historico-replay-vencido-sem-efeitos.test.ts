import { beforeEach, describe, expect, it, vi } from "vitest";

const efeitos = vi.hoisted(() => ({
  optOut: vi.fn(), recuperar: vi.fn(), contato: vi.fn(), despacho: vi.fn(),
  fechar: vi.fn(), morrer: vi.fn(), ingerir: vi.fn(),
}));
vi.mock("@/lib/channels/pos-entrada", () => ({
  aplicarOptOutPendente: efeitos.optOut, aplicarEfeitosDaRecuperacao: efeitos.recuperar,
}));
vi.mock("@/lib/channels/zernio/ingest", () => ({
  contatoConhecidoDaEntrada: efeitos.contato, despachoJaPedido: efeitos.despacho,
}));
vi.mock("@/lib/channels/arquivo-de-webhook", () => ({
  fecharArquivoDoWebhook: efeitos.fechar, marcarArquivoDoWebhookComoMorto: efeitos.morrer,
}));
vi.mock("@/lib/channels/entrada-aceita", () => ({
  processarEntradaAceita: efeitos.ingerir, registrarFalhaDaEntrada: vi.fn(),
}));

import { reprocessarEntradasAceitas, JANELA_DA_ENTRADA_MS } from "@/lib/channels/reprocessar-entradas-aceitas";
import { MAX_TENTATIVAS } from "@/lib/channels/reprocessar-arquivo-de-webhook";

type Row = Record<string, unknown>;
const now = new Date("2026-11-13T12:00:00Z");
const tables: Record<string, Row[]> = {};
let failMessages = false;

/** Filtros e projeção realmente limitam os dados: metadata omitida no SELECT não aparece. */
function query(table: string) {
  const filters: Array<(row: Row) => boolean> = [];
  let columns = "*";
  let patch: Row | null = null;
  const execute = () => {
    if (table === "messages" && failMessages) return { data: null, error: { message: "unavailable" } };
    const rows = (tables[table] ?? []).filter(row => filters.every(f => f(row)));
    if (patch) rows.forEach(row => Object.assign(row, patch));
    return { data: rows.map(row => columns === "*" ? row : Object.fromEntries(
      columns.split(",").map(key => [key.trim(), row[key.trim()]]),
    )), error: null };
  };
  const q = {
    select(value: string) { columns = value; return q; },
    update(value: Row) { patch = value; return q; },
    insert(value: Row) { (tables[table] ??= []).push(value); return q; },
    eq(key: string, value: unknown) { filters.push(row => row[key] === value); return q; },
    in(key: string, values: unknown[]) { filters.push(row => values.includes(row[key])); return q; },
    gte(key: string, value: string) { filters.push(row => String(row[key]) >= value); return q; },
    lt(key: string, value: string) { filters.push(row => String(row[key]) < value); return q; },
    is(key: string, value: unknown) { filters.push(row => (row[key] ?? null) === value); return q; },
    order() { return q; }, limit() { return q; },
    async maybeSingle() { const r = execute(); return { ...r, data: r.data?.[0] ?? null }; },
    then(resolve: (value: unknown) => unknown) { return Promise.resolve(execute()).then(resolve); },
  };
  return q;
}
const db = { from: query };

function seed(metadata: unknown, expired = true) {
  const payload = {
    id: "event-test", event: "message.received", account: { id: "account-test" },
    message: {
      id: "provider-test", conversationId: "thread-test", platform: "whatsapp",
      platformMessageId: "wamid.history-test", direction: "incoming", text: "parar",
      attachments: [], sender: { phoneNumber: "+5511900000003", name: "Teste" },
      sentAt: "2026-10-01T12:00:00Z",
    },
  };
  tables.webhook_events_log = [{
    id: "archive-test", organization_id: "org-test", channel_session_id: "session-test",
    provider: "zernio", raw_body: JSON.stringify(payload), payload_parsed: payload,
    status: "received", valid_signature: true, attempts: expired ? 0 : MAX_TENTATIVAS - 1,
    error_message: null,
    received_at: new Date(now.getTime() - (expired ? JANELA_DA_ENTRADA_MS + 60_000 : 600_000)).toISOString(),
  }];
  tables.messages = [{
    id: "message-test", organization_id: "org-test", external_id: "wamid.history-test",
    conversation_id: "conversation-test", contact_id: "contact-test", direction: "inbound",
    sent_at: payload.message.sentAt, metadata,
  }];
  tables.channel_sessions = [{ id: "session-test", organization_id: "org-test", provider: "zernio", archived_at: null }];
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(tables)) delete tables[key];
  failMessages = false;
  efeitos.contato.mockResolvedValue({ contactId: "contact-test", conversationId: "conversation-test" });
  efeitos.despacho.mockResolvedValue(false);
  efeitos.ingerir.mockResolvedValue({ tipo: "falhou", detalhe: "falha transitória na retomada" });
  efeitos.morrer.mockResolvedValue("gravado");
});

describe("recuperação de webhook não desperta histórico importado", () => {
  it.each([true, "true"])("fecha a entrada vencida marcada %s sem efeitos", async marker => {
    seed({ historico_importado: marker });
    const result = await reprocessarEntradasAceitas(db as never, now);
    expect(result.processadas).toBe(1);
    expect(efeitos.fechar).toHaveBeenCalledWith(db, "archive-test", expect.objectContaining({
      status: "processed", erro: "historico_importado",
    }));
    expect(efeitos.optOut).not.toHaveBeenCalled();
    expect(efeitos.recuperar).not.toHaveBeenCalled();
    expect(efeitos.despacho).not.toHaveBeenCalled();
    expect(tables.agent_inbox_items ?? []).toHaveLength(0);
  });

  it("não aplica um STOP histórico nem declara perda ao esgotar tentativas", async () => {
    seed({ historico_importado: "true" }, false);
    const result = await reprocessarEntradasAceitas(db as never, now);
    expect(result).toMatchObject({ processadas: 1, desistidas: 0 });
    expect(efeitos.optOut).not.toHaveBeenCalled();
    expect(efeitos.contato).not.toHaveBeenCalled();
    expect(efeitos.morrer).not.toHaveBeenCalled();
    expect(tables.agent_inbox_items ?? []).toHaveLength(0);
  });

  it.each([{}, { historico_importado: false }, { historico_importado: "false" }])(
    "preserva recuperação e STOP da mensagem viva %j", async metadata => {
      seed(metadata);
      await reprocessarEntradasAceitas(db as never, now);
      expect(efeitos.optOut).toHaveBeenCalledTimes(1);
      expect(efeitos.recuperar).toHaveBeenCalledTimes(1);
      expect(tables.agent_inbox_items).toHaveLength(1);
    },
  );

  it.each([true, false])("erro de leitura mantém a entrada recuperável (vencida=%s)", async expired => {
    seed({ historico_importado: true }, expired); failMessages = true;
    await reprocessarEntradasAceitas(db as never, now);
    expect(efeitos.fechar).not.toHaveBeenCalled();
    expect(efeitos.morrer).not.toHaveBeenCalled();
    expect(efeitos.optOut).not.toHaveBeenCalled();
    expect(efeitos.recuperar).not.toHaveBeenCalled();
  });
});
