import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { consultarHistoricoDisponivel } from "@/lib/channels/historico/disponivel";
import { GET } from "./route";
import { fail } from "@/lib/api/wrappers";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/channels/historico/disponivel", () => ({ consultarHistoricoDisponivel: vi.fn() }));
const id = "22222222-2222-4222-8222-222222222222";
const req = (q = "dias=30") => new NextRequest(`http://localhost/api/v1/channel-sessions/${id}/historico/disponivel?${q}`);
const ctx = (canal = id) => ({ params: Promise.resolve({ id: canal }) });
const db = {} as ReturnType<typeof createAdminClient>;
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireRole).mockResolvedValue({ ok: true, user: { id: "u1" }, org: { orgId: "org-ativa", role: "admin" } } as Awaited<ReturnType<typeof requireRole>>);
  vi.mocked(createAdminClient).mockReturnValue(db);
  vi.mocked(consultarHistoricoDisponivel).mockResolvedValue({ conversas: 1, mensagens: 2, audios: 0, imagens: 0, desde: "2026-10-14T00:00:00.000Z", parcial: true, semConteudo: 0, repetidasNoProvedor: 0, existentesNoCrm: 0, chamadas: 20 });
});
it("exige admin e usa org autenticada, ignorando tentativa de escolher org/conta", async () => {
  const r = await GET(req("dias=30&organization_id=vizinha&accountId=errada"), ctx());
  expect(r.status).toBe(200);
  expect(requireRole).toHaveBeenCalledWith("admin", expect.objectContaining({ resource: "channel_sessions", allowPlatformAdmin: "leitura" }));
  expect(consultarHistoricoDisponivel).toHaveBeenCalledWith(db, { organizationId: "org-ativa", channelSessionId: id, dias: 30, signal: expect.any(AbortSignal) });
  expect((await r.json()).data.previa.parcial).toBe(true);
  expect(r.headers.get("cache-control")).toContain("no-store");
});
it("sem autorização não consulta banco/provedor", async () => {
  vi.mocked(requireRole).mockResolvedValue({ ok: false, response: fail("forbidden", "Sem permissão", 403) });
  expect((await GET(req(), ctx())).status).toBe(403);
  expect(createAdminClient).not.toHaveBeenCalled();
});
it.each(["dias=0", "dias=9999", "dias=foo"])("rejeita janela inválida %s", async (query) => {
  expect((await GET(req(query), ctx())).status).toBe(422);
  expect(consultarHistoricoDisponivel).not.toHaveBeenCalled();
});
it("rejeita id inválido", async () => {
  expect((await GET(req(), ctx("errado"))).status).toBe(422);
  expect(consultarHistoricoDisponivel).not.toHaveBeenCalled();
});
it("canal de outra organização não é exposto", async () => {
  vi.mocked(consultarHistoricoDisponivel).mockRejectedValue(new Error("historico_canal_nao_encontrado"));
  expect((await GET(req(), ctx())).status).toBe(404);
});
it("erro não vaza conteúdo interno nem vira contagem zero", async () => {
  vi.mocked(consultarHistoricoDisponivel).mockRejectedValue(new Error("segredo-sintetico payload privado"));
  const r = await GET(req(), ctx());
  expect(r.status).toBe(502);
  expect(await r.text()).not.toMatch(/segredo|payload|previa/);
});
