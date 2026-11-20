import { afterEach, describe, expect, it, vi } from "vitest";
import { URL_DE_VALIDACAO_FISH, validateFishKey } from "./provider-fish";
import { validateProviderKey } from "./provider-validators";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("credencial Fish — prova autenticada sem gerar áudio", () => {
  it("valida pela carteira self, aceita saldo zero e não chama TTS nem biblioteca pública", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ user_id: "fish-user", credit: "0" })));
    vi.stubGlobal("fetch", fetchMock);
    expect(await validateProviderKey("fish", "chave-fish-teste")).toEqual({ ok: true, models: [] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(URL_DE_VALIDACAO_FISH, expect.objectContaining({
      method: "GET",
      headers: { Authorization: "Bearer chave-fish-teste" },
      redirect: "error",
      signal: expect.any(AbortSignal),
    }));
  });

  it.each([401, 403])("recusa autenticação HTTP %s sem persistir corpo do provedor", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("detalhe com segredo", { status })));
    expect(await validateFishKey("chave")).toEqual({ ok: false, error: "auth_failed_401" });
  });

  it.each([402, 429, 503])("não chama HTTP %s de chave inválida", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("detalhe privado", { status })));
    expect(await validateFishKey("chave")).toEqual({ ok: false, error: `provider_status_${status}` });
  });

  it.each([null, {}, { items: [] }, { user_id: "", credit: "0" }])("recusa sucesso com resposta inesperada: %j", async (body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(body))));
    expect(await validateFishKey("chave")).toEqual({ ok: false, error: "provider_response_invalid" });
  });

  it("erro de transporte não expõe mensagem nem nome arbitrário da exceção", async () => {
    const erro = new Error("chave-secreta");
    erro.name = "chave-secreta";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(erro));
    expect(await validateFishKey("chave")).toEqual({ ok: false, error: "network_error" });
  });

  it("aborta após 5s sem retry e limpa o timer", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new DOMException("tempo esgotado", "AbortError")));
    }));
    vi.stubGlobal("fetch", fetchMock);
    const result = validateFishKey("chave");
    await vi.advanceTimersByTimeAsync(5000);
    expect(await result).toEqual({ ok: false, error: "AbortError" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
