import { beforeEach, describe, expect, it, vi } from "vitest";
import { socialRequest } from "../social/client";
import { zernioCredsForAccountId } from "../zernio/credentials";
import { resolverEscopoDoHistorico } from "./zernio-escopo";

vi.mock("../social/client", () => ({ socialRequest: vi.fn() }));
vi.mock("../zernio/credentials", () => ({ zernioCredsForAccountId: vi.fn() }));
let sessao: Record<string, unknown> | null;
let erro: { message: string } | null;
const filtros: unknown[][] = [];
const db = {
  from(tabela: string) {
    expect(tabela).toBe("channel_sessions");
    const q = {
      select: () => q,
      eq: (...args: unknown[]) => { filtros.push(args); return q; },
      is: (...args: unknown[]) => { filtros.push(args); return q; },
      maybeSingle: async () => ({ data: sessao, error: erro }),
    };
    return q;
  },
} as never;
const conta = { _id: "conta", platform: "whatsapp", isActive: true, profileId: { _id: "perfil" } };
beforeEach(() => {
  vi.clearAllMocks(); filtros.length = 0; erro = null;
  sessao = { provider: "zernio", zernio_account_id: "conta", zernio_profile_id: null, metadata: {} };
  vi.mocked(zernioCredsForAccountId).mockResolvedValue({ accountId: "conta", apiKey: "segredo-sintetico", source: "session", baseUrl: "https://unused.invalid" });
  vi.mocked(socialRequest).mockResolvedValue({ accounts: [conta] });
});
const run = () => resolverEscopoDoHistorico(db, "org-autorizada", "sessao-autorizada");

describe("escopo do histórico vem da sessão autorizada", () => {
  it("filtra sessão por org e arquivamento e resolve perfil pela conta exata", async () => {
    expect(await run()).toEqual({ chave: "segredo-sintetico", contaId: "conta", perfilId: "perfil", plataforma: "whatsapp" });
    expect(filtros).toEqual([["organization_id", "org-autorizada"], ["id", "sessao-autorizada"], ["archived_at", null]]);
    expect(zernioCredsForAccountId).toHaveBeenCalledWith(db, { organizationId: "org-autorizada", accountId: "conta" });
    expect(socialRequest).toHaveBeenCalledWith("segredo-sintetico", "accounts", undefined, "GET", undefined);
  });
  it("usa o perfil gravado como filtro e o confere na resposta", async () => {
    sessao!.zernio_profile_id = "perfil";
    await run();
    expect(socialRequest).toHaveBeenCalledWith("segredo-sintetico", "accounts?profileId=perfil", undefined, "GET", undefined);
    vi.mocked(socialRequest).mockResolvedValue({ accounts: [{ ...conta, profileId: "outra" }] });
    await expect(run()).rejects.toThrow("historico_escopo_divergente");
  });
  it("não transforma ausência ou falha de banco em credencial de ambiente", async () => {
    sessao = null;
    await expect(run()).rejects.toThrow("historico_canal_nao_encontrado");
    expect(zernioCredsForAccountId).not.toHaveBeenCalled();
    erro = { message: "erro interno que não deve vazar" };
    await expect(run()).rejects.toThrow("historico_sessao_indisponivel");
    expect(socialRequest).not.toHaveBeenCalled();
  });
  it("sem credencial da sessão não consulta provedor nem cai no env", async () => {
    vi.mocked(zernioCredsForAccountId).mockResolvedValue(null);
    await expect(run()).rejects.toThrow("historico_credencial_indisponivel");
    expect(socialRequest).not.toHaveBeenCalled();
  });
  it("não aceita a credencial de uma conta diferente", async () => {
    vi.mocked(zernioCredsForAccountId).mockResolvedValue({ accountId: "vizinho", apiKey: "x", source: "session", baseUrl: "x" });
    await expect(run()).rejects.toThrow("historico_escopo_divergente");
    expect(socialRequest).not.toHaveBeenCalled();
  });
  it.each(["waha", "meta", "desconhecido"])("não envia %s ao leitor intermediado", async (provider) => {
    sessao!.provider = provider;
    await expect(run()).rejects.toThrow("historico_canal_nao_suportado");
    expect(socialRequest).not.toHaveBeenCalled();
  });
  it("rede social usa a plataforma gravada, nunca o rótulo da conta", async () => {
    sessao = { ...sessao, provider: "zernio_social", metadata: { social_platform: "instagram" } };
    vi.mocked(socialRequest).mockResolvedValue({ accounts: [{ ...conta, platform: "instagram" }] });
    expect(await run()).toMatchObject({ plataforma: "instagram" });
    vi.mocked(socialRequest).mockResolvedValue({ accounts: [conta] });
    await expect(run()).rejects.toThrow("historico_escopo_divergente");
  });
  it.each([
    { accounts: [] },
    { accounts: [conta, conta] },
    { accounts: [{ ...conta, _id: "vizinho" }] },
    { accounts: [{ ...conta, isActive: false }] },
  ])("conta ausente, ambígua ou inativa não autoriza a leitura: %j", async (resposta) => {
    vi.mocked(socialRequest).mockResolvedValue(resposta);
    await expect(run()).rejects.toThrow("historico_conta_indisponivel");
  });
});
