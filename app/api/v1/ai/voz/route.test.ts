import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type * as Catalogo from "@/lib/ai/voz/catalogo-do-provedor";

const deps = vi.hoisted(() => ({
  requireRole: vi.fn(),
  support: vi.fn(),
  audit: vi.fn(),
  from: vi.fn(),
  resolve: vi.fn(),
  listar: vi.fn(),
  pool: {},
}));
vi.mock("@/lib/auth/require-role", () => ({ requireRole: deps.requireRole }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: deps.support }));
vi.mock("@/lib/audit", () => ({ audit: deps.audit }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: deps.from }) }));
vi.mock("@/lib/agent-engine/db/request-pool", () => ({ getRequestPool: () => deps.pool }));
vi.mock("@/lib/agent-engine/env", () => ({ loadEnv: () => ({}) }));
vi.mock("@/lib/agent-engine/edge/llm/run-model-call", () => ({ llmEdgeConfigFromEnv: () => ({}) }));
vi.mock("@/lib/agent-engine/edge/llm/credentials", () => ({ resolveOrgLlmConfig: deps.resolve }));
vi.mock("@/lib/i18n/dicionario", () => ({ traduzir: (s: string) => s }));
vi.mock("@/lib/ai/voz/catalogo-do-provedor", async (original) => ({
  ...(await original<typeof Catalogo>()),
  listarVozesDoProvedor: deps.listar,
}));
import { GET, PATCH } from "./route";

const ORG = "org-da-sessao";
const ID_FISH = "d84300b9f2bd453caebcca83639daaa7";
function banco(settings: Record<string, unknown>, creds: unknown[] = []) {
  const organization = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: { settings }, error: null }),
  };
  const credential = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: creds, error: null }),
  };
  deps.from.mockImplementation((table: string) => {
    if (table === "organizations") return organization;
    if (table === "ai_provider_credentials") return credential;
    throw new Error("unexpected table");
  });
  return { organization, credential };
}
function request(body: Record<string, unknown>) {
  return new NextRequest("https://crm.test/api/v1/ai/voz", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  deps.requireRole.mockResolvedValue({
    ok: true,
    org: { orgId: ORG },
    user: { id: "user", idioma: "pt-BR" },
  });
  deps.support.mockResolvedValue(null);
  deps.resolve.mockResolvedValue({ apiKey: "segredo-nao-retornado" });
  deps.listar.mockResolvedValue([]);
});

describe("voz da organização: escolha de provedor", () => {
  it("não oferece valores inválidos do catálogo salvo como IDs de voz", async () => {
    banco({}, [{ models_available: [null, { id: "não-é-string" }] }]);
    deps.resolve.mockRejectedValue(new Error("credencial indisponível"));
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ vozesDisponiveis: [], catalogo: [] });
  });

  it("GET legado mantém ElevenLabs e só consulta credencial ativa validada mais recente da sessão", async () => {
    const db = banco({ voz: { voice_id: "voz-legada" } }, [
      { models_available: ["voz-legada"], validated_at: "hoje" },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({
      provider: "elevenlabs",
      voiceId: "voz-legada",
      temCredencial: true,
    });
    expect(db.organization.eq).toHaveBeenCalledWith("id", ORG);
    expect(db.credential.eq).toHaveBeenCalledWith("organization_id", ORG);
    expect(db.credential.eq).toHaveBeenCalledWith("provider", "elevenlabs");
    expect(db.credential.eq).toHaveBeenCalledWith("is_active", true);
    expect(db.credential.not).toHaveBeenCalledWith("validated_at", "is", null);
    expect(db.credential.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(db.credential.limit).toHaveBeenCalledWith(1);
  });

  it("catálogo Fish não grava nem reaproveita voz/modelo ElevenLabs", async () => {
    const db = banco({ voz: { voice_id: "voz-legada", model_id: "eleven_turbo_v2" } }, [
      { models_available: [], validated_at: "hoje" },
    ]);
    deps.listar.mockResolvedValue([{ id: ID_FISH, nome: "Alfred", idioma: null }]);
    const res = await GET(
      new NextRequest("https://crm.test/api/v1/ai/voz?provider=fish&organization_id=outra"),
    );
    const body = await res.json();
    expect(body.data).toMatchObject({
      provider: "fish",
      providerSalvo: "elevenlabs",
      voiceId: null,
      modelId: null,
    });
    expect(deps.resolve).toHaveBeenCalledWith(deps.pool, {}, ORG, { provider: "fish" });
    expect(deps.listar).toHaveBeenCalledWith("segredo-nao-retornado", fetch, undefined, "fish");
    expect(JSON.stringify(body)).not.toContain("segredo-nao-retornado");
    expect(db.organization.update).not.toHaveBeenCalled();
  });

  it("PATCH troca provider sem herdar modelo incompatível e preserva branding/security", async () => {
    const originais = {
      branding: { name: "Marca" },
      security: { mfa_required: true },
      voz: { voice_id: "voz-legada", model_id: "eleven_turbo_v2" },
    };
    const db = banco(originais);
    const res = await PATCH(
      request({ provider: "fish", voice_id: ID_FISH, organization_id: "outra" }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ provider: "fish", voiceId: ID_FISH, modelId: null });
    expect(db.organization.update).toHaveBeenCalledWith({
      settings: { ...originais, voz: { provider: "fish", voice_id: ID_FISH } },
    });
    expect(
      db.organization.eq.mock.calls.every(([key, value]) => key === "id" && value === ORG),
    ).toBe(true);
    expect(deps.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG,
        metadata: { provider: "fish", voice_id: ID_FISH, model_id: null },
      }),
    );
  });

  it("PATCH legado preserva o modelo quando omitido e resposta reflete o salvo", async () => {
    banco({ voz: { voice_id: "voz-legada", model_id: "eleven_turbo_v2" } });
    const res = await PATCH(request({ voice_id: "outra-voz" }));
    expect((await res.json()).data).toEqual({
      provider: "elevenlabs",
      voiceId: "outra-voz",
      modelId: "eleven_turbo_v2",
    });
  });

  it.each([
    { provider: "fish", voice_id: ID_FISH, model_id: "eleven_turbo_v2" },
    { provider: "fish", voice_id: "voz-legada" },
    { provider: "invalido", voice_id: ID_FISH },
  ])("PATCH inválido não escreve: %j", async (body) => {
    const db = banco({});
    expect((await PATCH(request(body))).status).toBe(422);
    expect(db.organization.update).not.toHaveBeenCalled();
    expect(deps.audit).not.toHaveBeenCalled();
  });

  it("falha de leitura não sobrescreve settings com objeto vazio", async () => {
    const db = banco({});
    db.organization.maybeSingle.mockResolvedValue({
      data: null,
      error: { code: "falhou" },
    } as never);
    expect((await PATCH(request({ provider: "fish", voice_id: ID_FISH }))).status).toBe(500);
    expect(db.organization.update).not.toHaveBeenCalled();
  });

  it("nega escrita sem papel e preserva a guarda de suporte", async () => {
    const db = banco({});
    deps.requireRole.mockResolvedValue({
      ok: false,
      response: new Response(null, { status: 403 }),
    });
    expect((await PATCH(request({ provider: "fish", voice_id: ID_FISH }))).status).toBe(403);
    expect(db.organization.update).not.toHaveBeenCalled();
    deps.support.mockResolvedValue(new Response(null, { status: 403 }));
    expect((await PATCH(request({ provider: "fish", voice_id: ID_FISH }))).status).toBe(403);
  });
});
