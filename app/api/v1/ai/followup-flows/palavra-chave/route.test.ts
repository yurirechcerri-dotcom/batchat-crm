/**
 * POST /api/v1/ai/followup-flows/palavra-chave — a rota que instala fluxo + regra.
 *
 * Mede o que importa: valida a entrada, cria o fluxo como RASCUNHO e a regra
 * SEM `is_active`, e desfaz o fluxo se a regra falhar (nada de fluxo órfão).
 * Supabase é dublê: isto prova a lógica da rota, NÃO o banco (RLS, constraints).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "11111111-1111-4111-8111-111111111111";
const FLUXO = "22222222-2222-4222-8222-222222222222";

const m = vi.hoisted(() => ({
  inserts: [] as { tabela: string; linha: Record<string, unknown> }[],
  deletes: [] as string[],
  respostas: {} as Record<string, { data: unknown; error: { code?: string; message: string } | null }>,
  suporte: null as Response | null,
}));

vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: async () => m.suporte }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/auth/require-role", () => ({
  requireRole: async () => ({ ok: true, user: { id: USER, idioma: "pt-BR" }, org: { orgId: ORG } }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (tabela: string) => ({
      insert: (linha: Record<string, unknown>) => {
        m.inserts.push({ tabela, linha });
        return { select: () => ({ single: async () => m.respostas[tabela] }) };
      },
      delete: () => ({
        eq: () => ({
          eq: async () => {
            m.deletes.push(tabela);
            return { error: null };
          },
        }),
      }),
    }),
  }),
}));

import { POST } from "./route";

function pedido(corpo: unknown) {
  return new Request("http://x/api", { method: "POST", body: JSON.stringify(corpo) }) as never;
}
const OK = { model_id: "palavra-entrega-material", palavras: "agentes, guia", link: "https://exemplo.com/guia" };

beforeEach(() => {
  m.inserts = [];
  m.deletes = [];
  m.suporte = null;
  m.respostas = {
    followup_flow_pointers: { data: { id: FLUXO, name: "n" }, error: null },
    automation_rules: { data: { id: "r1" }, error: null },
  };
});

describe("entrada", () => {
  it("modelo inexistente → 404, nada gravado", async () => {
    const r = await POST(pedido({ ...OK, model_id: "nao-existe" }));
    expect(r.status).toBe(404);
    expect(m.inserts).toHaveLength(0);
  });

  it("modelo que pede link, sem link → 422", async () => {
    const r = await POST(pedido({ model_id: "palavra-entrega-material", palavras: "agentes" }));
    expect(r.status).toBe(422);
    expect(m.inserts).toHaveLength(0);
  });

  it("link que não é http(s) → 422", async () => {
    const r = await POST(pedido({ ...OK, link: "javascript:alert(1)" }));
    expect(r.status).toBe(422);
  });

  it("mais de 5 palavras ou palavra de 1 letra → 422", async () => {
    expect((await POST(pedido({ ...OK, palavras: "aa,bb,cc,dd,ee,ff" }))).status).toBe(422);
    expect((await POST(pedido({ ...OK, palavras: "a" }))).status).toBe(422);
  });

  it("campo desconhecido no corpo é recusado", async () => {
    expect((await POST(pedido({ ...OK, is_active: true }))).status).toBe(422);
  });

  it("acompanhamento (suporte) não escreve", async () => {
    m.suporte = new Response("negado", { status: 403 });
    const r = await POST(pedido(OK));
    expect(r.status).toBe(403);
    expect(m.inserts).toHaveLength(0);
  });
});

describe("instalação", () => {
  it("cria o fluxo como rascunho manual e a regra apontando para ele, sem ligar nada", async () => {
    const r = await POST(pedido(OK));
    expect(r.status).toBe(201);
    const [fluxo, regra] = m.inserts;
    expect(fluxo?.tabela).toBe("followup_flow_pointers");
    expect(fluxo?.linha).toMatchObject({ organization_id: ORG, trigger_config: { kind: "manual" } });
    // O texto sai com o link no fim, e o fluxo nunca é publicado aqui.
    expect(JSON.stringify(fluxo?.linha.draft_graph)).toContain("https://exemplo.com/guia");
    expect(fluxo?.linha).not.toHaveProperty("status");
    expect(regra?.tabela).toBe("automation_rules");
    expect(regra?.linha).toMatchObject({ organization_id: ORG, trigger_event: "message.received" });
    expect(regra?.linha).not.toHaveProperty("is_active");
    expect(JSON.stringify(regra?.linha.actions)).toContain(FLUXO);
    expect(JSON.stringify(regra?.linha.conditions)).toContain("guia");
    expect(m.deletes).toHaveLength(0);
  });

  it("nome repetido → 409 com o nome, sem criar regra", async () => {
    m.respostas.followup_flow_pointers = { data: null, error: { code: "23505", message: "dup" } };
    const r = await POST(pedido(OK));
    expect(r.status).toBe(409);
    expect(m.inserts.map((i) => i.tabela)).toEqual(["followup_flow_pointers"]);
  });

  it("regra falhou → o fluxo recém-criado é APAGADO (nada de órfão) e a resposta é erro", async () => {
    m.respostas.automation_rules = { data: null, error: { message: "boom" } };
    const r = await POST(pedido(OK));
    expect(r.status).toBe(500);
    expect(m.deletes).toEqual(["followup_flow_pointers"]);
  });
});
