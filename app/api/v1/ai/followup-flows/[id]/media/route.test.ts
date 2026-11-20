// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const deps = vi.hoisted(() => ({ role: vi.fn(), support: vi.fn(), client: vi.fn(), admin: vi.fn(), audit: vi.fn(), upload: vi.fn() }));
vi.mock("@/lib/auth/require-role", () => ({ requireRole: deps.role }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: deps.support }));
vi.mock("@/lib/supabase/server", () => ({ createClient: deps.client }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: deps.admin }));
vi.mock("@/lib/audit", () => ({ audit: deps.audit }));
import { POST } from "./route";

const ID = "11111111-1111-4111-8111-111111111111";
const ORG = "22222222-2222-4222-8222-222222222222";
const bytes = Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
let filters: Record<string, string>;
function database(found = true) {
  const query = { select: () => query, eq: (key: string, value: string) => { filters[key] = value; return query; },
    maybeSingle: async () => ({ data: found ? { id: ID } : null, error: null }) };
  deps.client.mockResolvedValue({ from: () => query });
}
async function request(fileBytes = bytes, sizeHeader?: string) {
  const form = new FormData();
  form.set("file", new File([fileBytes], "foto.png", { type: "image/png" }));
  form.set("organization_id", "attacker");
  return POST(new NextRequest(`http://localhost/api/v1/ai/followup-flows/${ID}/media`, {
    method: "POST", body: form, headers: sizeHeader ? { "content-length": sizeHeader } : undefined,
  }), { params: Promise.resolve({ id: ID }) });
}
beforeEach(() => {
  vi.clearAllMocks(); filters = {};
  deps.support.mockResolvedValue(null);
  deps.role.mockResolvedValue({ ok: true, org: { orgId: ORG }, user: { id: ID } });
  deps.upload.mockResolvedValue({ error: null });
  deps.admin.mockReturnValue({ storage: {
    getBucket: async () => ({ data: { public: false }, error: null }),
    from: () => ({ upload: deps.upload }),
  } });
  database();
});
describe("upload privado no fluxo", () => {
  it("usa organização autenticada, hash durável e audita sem publicar/enviar", async () => {
    const response = await request(); expect(response.status).toBe(200);
    expect(filters).toEqual({ id: ID, organization_id: ORG });
    expect((await response.json()).data.media_url).toMatch(new RegExp(`^storage://followup-media/${ORG}/[a-f0-9]{64}.png$`));
    expect(deps.role).toHaveBeenCalledWith("manager", expect.anything());
    expect(deps.audit).toHaveBeenCalledWith(expect.objectContaining({ organizationId: ORG, action: "followup_flow.media_uploaded" }));
  });
  it("recusa viewer e suporte somente leitura antes de ler/gravar arquivo", async () => {
    deps.role.mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) });
    expect((await request()).status).toBe(403); expect(deps.upload).not.toHaveBeenCalled();
    deps.support.mockResolvedValue(new Response(null, { status: 403 }));
    expect((await request()).status).toBe(403);
  });
  it("fluxo fora da organização não pode subir mídia", async () => {
    database(false); expect((await request()).status).toBe(404); expect(deps.admin).not.toHaveBeenCalled();
  });
  it("recusa payload excessivo mesmo sem content-length e tipo forjado", async () => {
    expect((await request(Buffer.alloc(15_000_001))).status).toBe(413);
    expect((await request(bytes, "20000000")).status).toBe(413);
    expect((await request(Buffer.from("<html>not a picture</html>"))).status).toBe(422);
    expect(deps.upload).not.toHaveBeenCalled();
  });
  it("erro de Storage não produz referência nem auditoria de sucesso", async () => {
    deps.upload.mockResolvedValue({ error: { message: "offline" } });
    expect((await request()).status).toBe(500); expect(deps.audit).not.toHaveBeenCalled();
  });
});
