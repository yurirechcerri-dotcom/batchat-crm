import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { resolverEscopoDoHistorico } from "./zernio-escopo";
import { criarLeitorZernio } from "./zernio-leitura";
import { consultarHistoricoDisponivel } from "./disponivel";
import { parseSocialMessage } from "../social/parser";

vi.mock("./zernio-escopo", () => ({ resolverEscopoDoHistorico: vi.fn() }));
vi.mock("./zernio-leitura", () => ({ criarLeitorZernio: vi.fn() }));
const filtros: unknown[][] = [];
let rows: unknown[] = [];
let erro: unknown = null;
let quantidade = 1;
let prefixo = "m";
const db = { from(tabela: string) {
  expect(tabela).toBe("messages");
  let selecionados: string[] = [];
  const q = { select: () => q,
    abortSignal: () => q,
    eq: (...args: unknown[]) => { filtros.push(args); return q; },
    in: (...args: unknown[]) => {
      const ids = args[1] as string[];
      selecionados = ids;
      const filtro = new URLSearchParams({ external_id: `in.(${ids.join(",")})` }).toString();
      if (ids.length > 25 || filtro.length > 5_000) throw new Error("request_uri_too_large");
      filtros.push(args); return q;
    },
    then: (resolve: (r: unknown) => unknown) => Promise.resolve(resolve({
      data: rows.filter((r) => selecionados.includes((r as { external_id: string }).external_id)), error: erro,
    })),
  }; return q;
} } as never;
beforeEach(() => {
  vi.clearAllMocks(); filtros.length = 0; rows = []; erro = null; quantidade = 1; prefixo = "m";
  vi.mocked(resolverEscopoDoHistorico).mockResolvedValue({ contaId: "conta", perfilId: "perfil", chave: "segredo-sintetico", plataforma: "whatsapp" });
  vi.mocked(criarLeitorZernio).mockReturnValue({
    conversas: async () => ({ itens: [{ id: "c1", participanteId: "p1", bsuid: null, nome: "Nome sintético", atualizadaEm: "2026-11-12T12:00:00Z", grupo: false, conteudoIndisponivel: false }], proximoCursor: null }),
    mensagens: async () => ({ itens: Array.from({ length: quantidade }, (_, i) => ({ id: `${prefixo}${i + 1}`, conversaId: "c1", remetenteId: "p1", direcao: "inbound" as const, enviadaEm: "2026-11-12T12:00:00Z", texto: "Não devolver este texto", anexos: [], apagada: false, conteudoIndisponivel: false })), proximoCursor: null }),
  });
});
const run = () => consultarHistoricoDisponivel(db, { organizationId: "org", channelSessionId: "canal", dias: 30, agora: Date.parse("2026-11-13T00:00:00Z") });
afterEach(() => vi.useRealTimers());
it("consulta duplicatas na org certa, não escreve nem devolve credenciais ou conteúdo", async () => {
  rows = [{ external_id: "m1", channel_session_id: "canal" }];
  const r = await run();
  expect(r).toMatchObject({ mensagens: 1, existentesNoCrm: 1, parcial: false });
  expect(resolverEscopoDoHistorico).toHaveBeenCalledWith(db, "org", "canal", expect.any(AbortSignal));
  expect(filtros).toContainEqual(["organization_id", "org"]);
  expect(filtros).toContainEqual(["external_id", ["m1"]]);
  expect(JSON.stringify(r)).not.toMatch(/segredo|Nome|devolver este texto|p1/);
});
it("colisão com outro canal não vira duplicata válida", async () => {
  rows = [{ external_id: "m1", channel_session_id: "vizinho" }];
  await expect(run()).rejects.toThrow("historico_identidade_em_conflito");
});
it.each(["instagram", "facebook"] as const)("%s confere a mesma identidade que o webhook grava", async (plataforma) => {
  vi.mocked(resolverEscopoDoHistorico).mockResolvedValue({ contaId: "conta", perfilId: "perfil", chave: "x", plataforma });
  const viva = parseSocialMessage({
    event: "message.received", account: { id: "conta", platform: plataforma },
    message: { id: "interno", platformMessageId: "m1", conversationId: "c1", platform: plataforma,
      direction: "incoming", sender: { id: "p1" }, text: "Sintético" },
  }, "conta", plataforma);
  expect(viva).not.toBeNull();
  rows = [{ external_id: viva!.externalId, channel_session_id: "canal" }];
  expect(await run()).toMatchObject({ mensagens: 1, existentesNoCrm: 1 });
  expect(filtros).toContainEqual(["external_id", [viva!.externalId]]);
});
it("não conta ID cru ou de outra conta social como a mensagem desta conexão", async () => {
  vi.mocked(resolverEscopoDoHistorico).mockResolvedValue({ contaId: "conta", perfilId: "perfil", chave: "x", plataforma: "instagram" });
  rows = [
    { external_id: "m1", channel_session_id: "canal" },
    { external_id: "social:vizinha:m1", channel_session_id: "vizinho" },
  ];
  expect(await run()).toMatchObject({ mensagens: 1, existentesNoCrm: 0 });
});
it("colisão social em outro canal é recusada com a identidade canônica", async () => {
  vi.mocked(resolverEscopoDoHistorico).mockResolvedValue({ contaId: "conta", perfilId: "perfil", chave: "x", plataforma: "instagram" });
  rows = [{ external_id: "social:conta:m1", channel_session_id: "vizinho" }];
  await expect(run()).rejects.toThrow("historico_identidade_em_conflito");
});
it("erro no banco interrompe a consulta, sem devolver zero como sucesso", async () => {
  erro = { message: "detalhe privado" };
  await expect(run()).rejects.toThrow("historico_conferencia_indisponivel");
});
it("sem sessão autorizada não abre o leitor", async () => {
  vi.mocked(resolverEscopoDoHistorico).mockRejectedValue(new Error("historico_canal_nao_encontrado"));
  await expect(run()).rejects.toThrow("historico_canal_nao_encontrado");
  expect(criarLeitorZernio).not.toHaveBeenCalled();
});
it("página cheia confere IDs em lotes pequenos sem perder mensagens", async () => {
  quantidade = 100;
  expect(await run()).toMatchObject({ mensagens: 100, parcial: false });
  const lotes = filtros.filter(([coluna]) => coluna === "external_id").map(([, ids]) => ids as string[]);
  expect(lotes.map((l) => l.length)).toEqual([25, 25, 25, 25]);
  expect(new Set(lotes.flat()).size).toBe(100);
});
it("prazo total inclui resolução de credencial e impede leitura posterior", async () => {
  vi.useFakeTimers();
  let concluir!: () => void;
  vi.mocked(resolverEscopoDoHistorico).mockImplementation(() => new Promise((resolve) => {
    concluir = () => resolve({ contaId: "conta", perfilId: "perfil", chave: "x", plataforma: "whatsapp" });
  }));
  const resultado = run();
  const esperado = expect(resultado).rejects.toThrow("historico_prazo_esgotado");
  await vi.advanceTimersByTimeAsync(60_000);
  await esperado;
  concluir();
  await vi.advanceTimersByTimeAsync(1);
  expect(criarLeitorZernio).not.toHaveBeenCalled();
});
it("limita o filtro realmente codificado também para pontuação em IDs", async () => {
  prefixo = "!".repeat(200); quantidade = 24;
  expect(await run()).toMatchObject({ mensagens: 24, parcial: false });
  const lotes = filtros.filter(([coluna]) => coluna === "external_id").map(([, ids]) => ids as string[]);
  expect(lotes.length).toBeGreaterThan(1);
  expect(new Set(lotes.flat()).size).toBe(24);
});
