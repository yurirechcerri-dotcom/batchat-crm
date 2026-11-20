import { afterEach, expect, it, vi } from "vitest";
import { apiClient } from "./client";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it("consulta longa termina depois de 12s sem repetir a requisição", async () => {
  vi.useFakeTimers();
  const fetch = vi.fn((_path: RequestInfo | URL, opts: RequestInit) => new Promise<Response>((resolve, reject) => {
    const timer = setTimeout(() => resolve(new Response(JSON.stringify({ data: { previa: { mensagens: 3 } } }), { status: 200 })), 12_000);
    opts.signal?.addEventListener("abort", () => { clearTimeout(timer); reject(opts.signal?.reason); }, { once: true });
  }));
  vi.stubGlobal("fetch", fetch);
  const promise = apiClient.get("/historico", { timeoutMs: 70_000, retry: false });
  await vi.advanceTimersByTimeAsync(12_000);
  expect(await promise).toEqual({ data: { previa: { mensagens: 3 } } });
  expect(fetch).toHaveBeenCalledTimes(1);
});
it.each(["rede", "503", "429"])("consulta sem retry não repete após %s", async (falha) => {
  const fetch = vi.fn();
  if (falha === "rede") fetch.mockRejectedValue(new TypeError("network"));
  else fetch.mockResolvedValue(new Response("{}", { status: Number(falha) }));
  vi.stubGlobal("fetch", fetch);
  await expect(apiClient.get("/historico", { timeoutMs: 70_000, retry: false })).rejects.toThrow();
  expect(fetch).toHaveBeenCalledTimes(1);
});
