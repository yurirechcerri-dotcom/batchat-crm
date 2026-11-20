import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), resolve: vi.fn(), dns: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/automation/outbound-ip", () => ({ assertDestinoResolvidoSeguro: mocks.dns }));
vi.mock("@/lib/channels/zernio/credentials", () => ({
  resolveZernioCreds: mocks.resolve,
  zernioCredsFromEnv: mocks.resolve,
  zernioCredsForAccountId: mocks.resolve,
  zernioBaseUrl: () => "https://zernio.com/api",
}));

import { zernioAdapter } from "@/lib/channels/adapters/zernio";
import { socialAdapter } from "@/lib/channels/social/adapter";
import { MediaTooLargeError } from "@/lib/messaging/media/types";

const LIMIT = 15_000_000;
const scope = { organizationId: "org-one", sessionRef: "account-one" };
function requestInit(index: number): RequestInit {
  const call = mocks.fetch.mock.calls[index];
  if (!call) throw new Error("fetch não foi chamado");
  return call[1] as RequestInit;
}

beforeEach(() => {
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.fetch.mockReset();
  mocks.resolve.mockReset().mockResolvedValue({
    apiKey: "synthetic-test-key", accountId: scope.sessionRef,
    baseUrl: "https://zernio.com/api", source: "session",
  });
  mocks.dns.mockReset().mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllGlobals());

describe.each([zernioAdapter, socialAdapter])("mídia recebida ($provider)", (adapter) => {
  const download = (url = "https://zernio.com/api/v1/media/test") =>
    adapter.fetchInboundMedia!({ ...scope, url, hintMime: "audio/ogg" });
  it("usa o escopo da conta e autentica somente a API confiável", async () => {
    mocks.fetch.mockResolvedValue(new Response(new Uint8Array([1, 2]), {
      headers: { "content-type": "image/png; charset=binary" },
    }));
    const result = await download();
    expect(mocks.resolve).toHaveBeenCalledWith({}, {
      organizationId: scope.organizationId, accountId: scope.sessionRef,
    });
    const init = requestInit(0);
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer synthetic-test-key");
    expect(init.redirect).toBe("error");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(result.mime).toBe("image/png");
    expect([...result.buffer]).toEqual([1, 2]);
  });

  it.each([
    "https://cdn.example.org/media/test",
    "https://zernio.com.evil.example/api/v1/media/test",
    "https://zernio.com/not-api/media/test",
    "https://zernio.com:8443/api/v1/media/test",
  ])("não entrega Bearer ao endereço %s", async (url) => {
    mocks.fetch.mockResolvedValue(new Response(new Uint8Array([1])));
    await download(url);
    const init = requestInit(0);
    expect(new Headers(init.headers).has("authorization")).toBe(false);
    expect(init.redirect).toBe("error");
  });

  it("cancela antes de ler um Content-Length acima do teto", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      pull(controller) { controller.enqueue(new Uint8Array([1])); controller.close(); },
      cancel,
    }, { highWaterMark: 0 });
    mocks.fetch.mockResolvedValue(new Response(body, {
      headers: { "content-length": String(LIMIT + 1) },
    }));
    const outcome = await download().then(() => "accepted", (error: unknown) => error);
    expect(outcome).toBeInstanceOf(MediaTooLargeError);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(body.locked).toBe(false);
  });

  it.each([undefined, "1"])("conta os bytes mesmo com tamanho declarado %s", async (size) => {
    const cancel = vi.fn();
    const chunks = [new Uint8Array(LIMIT), new Uint8Array(1)];
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        const chunk = chunks.shift();
        if (chunk) controller.enqueue(chunk);
        else controller.close();
      },
      cancel,
    }, { highWaterMark: 0 });
    mocks.fetch.mockResolvedValue(new Response(body, {
      headers: size ? { "content-length": size } : {},
    }));
    const outcome = await download().then(() => "accepted", (error: unknown) => error);
    expect(outcome).toBeInstanceOf(MediaTooLargeError);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(body.locked).toBe(false);
  });

  it("aceita o teto exato sem depender do cabeçalho", async () => {
    mocks.fetch.mockResolvedValue(new Response(new Uint8Array(LIMIT)));
    expect((await download()).buffer.byteLength).toBe(LIMIT);
  });

  it("libera a leitura quando o corpo é interrompido", async () => {
    const body = new ReadableStream<Uint8Array>({
      pull(controller) { controller.error(new Error("interrompido")); },
    });
    mocks.fetch.mockResolvedValue(new Response(body));
    await expect(download()).rejects.toThrow("interrompido");
    expect(body.locked).toBe(false);
  });

  it("falha sem rede quando a credencial da conta não existe", async () => {
    mocks.resolve.mockResolvedValue(null);
    await expect(download()).rejects.toThrow(/[Cc]redencial/);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("cancela o corpo também quando o provedor recusa o download", async () => {
    const cancel = vi.fn();
    mocks.fetch.mockResolvedValue(new Response(new ReadableStream({ cancel }, {
      highWaterMark: 0,
    }), { status: 429 }));
    await expect(download()).rejects.toThrow(/429/);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("autentica o prefixo da base configurada, sem herdar o prefixo padrão", async () => {
    mocks.resolve.mockResolvedValue({
      apiKey: "synthetic-test-key", accountId: scope.sessionRef,
      baseUrl: "https://zernio.com/custom", source: "session",
    });
    mocks.fetch.mockImplementation(async () => new Response(new Uint8Array([1])));
    await download("https://zernio.com/custom/v1/media/test");
    await download("https://zernio.com/api/v1/media/test");
    const first = requestInit(0);
    const second = requestInit(1);
    expect(new Headers(first.headers).get("authorization")).toBe("Bearer synthetic-test-key");
    expect(new Headers(second.headers).has("authorization")).toBe(false);
  });
});
