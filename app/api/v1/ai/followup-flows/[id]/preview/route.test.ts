import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const deps = vi.hoisted(() => ({ role: vi.fn(), client: vi.fn() }));
vi.mock("@/lib/auth/require-role", () => ({ requireRole: deps.role }));
vi.mock("@/lib/supabase/server", () => ({ createClient: deps.client }));
import { GET } from "./route";

const ID = "11111111-1111-4111-8111-111111111111";
const VERSION = "22222222-2222-4222-8222-222222222222";
const graph = { nodes: [
  { id: "t", type: "trigger", label: "Início", position: { x: 0, y: 0 }, config: {} },
  { id: "e", type: "end", label: "Fim", position: { x: 0, y: 0 }, config: { outcome: "exhausted" } },
], edges: [{ id: "te", source: "t", target: "e", priority: 0, condition: { type: "always" } }] };
type Row = Record<string, unknown>;
function database(overrides: { pointer?: Row | null; version?: Row | null; error?: boolean } = {}) {
  const queries: Array<{ table: string; filters: Record<string, unknown>; columns?: string }> = [];
  const db = { from(table: string) {
    const query = { table, filters: {} as Record<string, unknown>, columns: "" }; queries.push(query);
    const builder = {
      select(columns: string) { query.columns = columns; return builder; },
      eq(key: string, value: unknown) { query.filters[key] = value; return builder; },
      async maybeSingle() { return {
        data: table === "followup_flow_pointers"
          ? ("pointer" in overrides ? overrides.pointer : { id: ID, name: "Publicado", status: "active", active_version_id: VERSION, surface: "followup" })
          : ("version" in overrides ? overrides.version : { id: VERSION, graph }),
        error: overrides.error ? { message: "db unavailable" } : null,
      }; },
    }; return builder;
  } }; deps.client.mockResolvedValue(db); return queries;
}
const request = () => GET(new NextRequest(`http://localhost/api/v1/ai/followup-flows/${ID}/preview`), { params: Promise.resolve({ id: ID }) });
beforeEach(() => { vi.clearAllMocks(); deps.role.mockResolvedValue({ ok: true, org: { orgId: "org" }, user: {} }); });
describe("prévia publicada sem execução", () => {
  it("lê somente a versão ativa da organização e nunca o rascunho", async () => {
    const queries = database(); const res = await request(); expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ id: ID, name: "Publicado", version_id: VERSION, graph });
    expect(queries).toHaveLength(2);
    expect(queries.every((q) => q.filters.organization_id === "org")).toBe(true);
    expect(queries[1]?.filters).toEqual({ organization_id: "org", pointer_id: ID, id: VERSION });
    expect(queries[0]?.columns).not.toContain("draft_graph");
  });
  it("respeita recusa de acesso antes da consulta", async () => {
    deps.role.mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) });
    expect((await request()).status).toBe(403); expect(deps.client).not.toHaveBeenCalled();
  });
  it("não retorna fluxo ausente do escopo", async () => { database({ pointer: null }); expect((await request()).status).toBe(404); });
  it("recusa rascunho ou fluxo desativado sem consultar a versão", async () => {
    const queries = database({ pointer: { id: ID, status: "draft", active_version_id: VERSION } });
    expect((await request()).status).toBe(409); expect(queries).toHaveLength(1);
  });
  it("não oferece confirmação quando a versão está ausente ou inválida", async () => {
    database({ version: { id: VERSION, graph: {} } }); expect((await request()).status).toBe(409);
  });
});
