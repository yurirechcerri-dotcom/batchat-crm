import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendMessageHandler } from "@/app/api/v1/messages/_handler";
import type * as CredenciaisZernio from "@/lib/channels/zernio/credentials";
import type { HandlerCtx } from "@/lib/api/handlers/types";
import { criarDubleDoHandler } from "@/tests/helpers/duble-do-handler";

const { warn, resolveCreds } = vi.hoisted(() => ({ warn: vi.fn(), resolveCreds: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => {}) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/channels/zernio/credentials", async (original) => ({
  ...await original<typeof CredenciaisZernio>(),
  resolveZernioCreds: resolveCreds,
}));

const ORG = "11111111-1111-4111-8111-111111111111";
const CONV = "22222222-2222-4222-8222-222222222222";
const MESSAGE = "77777777-7777-4777-8777-777777777777";
const EVENT = "messages.send_pipeline_failure";
const ctx: HandlerCtx = {
  organization_id: ORG, actor: { type: "user", id: "55555555-5555-4555-8555-555555555555" },
  requestId: `handoff-aviso-${CONV}`, internalMessageId: MESSAGE,
};
function banco() {
  return criarDubleDoHandler({ conversation: {
    id: CONV, organization_id: ORG, contact_id: "33333333-3333-4333-8333-333333333333",
    channel_session_id: "44444444-4444-4444-8444-444444444444", is_group: false,
    provider_conversation_id: "synthetic-thread",
    contacts: { phone_number: "+5531999998888", wa_identity: null, is_blocked: false },
    channel_sessions: { provider: "zernio", zernio_account_id: "synthetic", status: "WORKING", archived_at: null },
  } });
}
async function falhar(erro: unknown, contexto = ctx) {
  const fetchMock = vi.fn().mockRejectedValue(erro);
  vi.stubGlobal("fetch", fetchMock);
  const db = banco();
  const result = await sendMessageHandler(db.supabase, contexto, {
    conversation_id: CONV, type: "text", body: "conteudo-privado",
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(result).toMatchObject({ id: MESSAGE, status: "failed", error_code: "zernio_error" });
  return db;
}
beforeEach(() => {
  warn.mockReset();
  resolveCreds.mockReset().mockResolvedValue({ accountId: "synthetic", apiKey: "synthetic", baseUrl: "https://invalid.test" });
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("diagnóstico pelo catch real de envio", () => {
  it("preserva códigos agregados sem expor texto, causa crua ou destino", async () => {
    const cause = new AggregateError([
      { code: "EAI_AGAIN", hostname: "host-privado", message: "chave-privada" },
      { code: "ECONNRESET", address: "ip-privado" },
      { code: "chave-privada" },
    ], "segredo-agregado");
    const db = await falhar(new TypeError("fetch failed", { cause }));
    expect(warn).toHaveBeenCalledWith(EVENT, {
      phase: "send_pipeline", network_codes: ["EAI_AGAIN", "ECONNRESET"],
      organization_id: ORG, message_id: MESSAGE, requestId: ctx.requestId,
    });
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/host-privado|chave-privada|ip-privado|segredo-agregado|conteudo-privado|fetch failed/);
    expect(db.mensagens[0]?.error_message).toBe("fetch failed");
  });
  it("omite requestId livre e não infere código a partir de mensagem", async () => {
    await falhar(new Error("EAI_AGAIN https://segredo.test/?token=privado"), { ...ctx, requestId: "token-privado" });
    expect(warn).toHaveBeenCalledWith(EVENT, {
      phase: "send_pipeline", network_codes: [], organization_id: ORG, message_id: MESSAGE,
    });
    expect(JSON.stringify(warn.mock.calls)).not.toContain("privado");
  });
  it("registra a fase ampla também quando a falha antecede o transporte", async () => {
    resolveCreds.mockRejectedValue(new TypeError("fetch failed", { cause: { code: "EAI_AGAIN" } }));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const db = banco();
    const result = await sendMessageHandler(db.supabase, ctx, {
      conversation_id: CONV, type: "text", body: "conteudo-privado",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.status).toBe("failed");
    expect(warn).toHaveBeenCalledWith(EVENT, expect.objectContaining({
      phase: "send_pipeline", network_codes: ["EAI_AGAIN"], message_id: MESSAGE,
    }));
  });
  it("falha do logger não interrompe persistência nem introduz retry", async () => {
    warn.mockImplementation(() => { throw new Error("logger fora"); });
    const db = await falhar(new TypeError("fetch failed", { cause: { code: "ENOTFOUND" } }));
    expect(db.mensagens).toHaveLength(1);
    expect(db.mensagens[0]?.status).toBe("failed");
  });
});
