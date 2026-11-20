import { describe, expect, it, vi } from "vitest";
import { calcularPreviaZernio } from "./zernio-previa";
import type { ConversaHistorico, LeitorHistoricoZernio, MensagemHistorico } from "./zernio-leitura";

const agora = Date.parse("2026-11-13T12:00:00Z");
const conversa = (id: string): ConversaHistorico => ({ id, participanteId: "p-" + id, nome: null, bsuid: null, atualizadaEm: "2026-11-01T12:00:00Z", grupo: false, conteudoIndisponivel: false });
const mensagem = (id: string, extra: Partial<MensagemHistorico> = {}): MensagemHistorico => ({
  id, conversaId: "c1", remetenteId: "p-c1", direcao: "inbound", enviadaEm: "2026-11-01T12:00:00Z",
  texto: "Texto sintético", anexos: [], apagada: false, conteudoIndisponivel: false, ...extra,
});
const pagina = <T>(itens: T[], proximoCursor: string | null = null) => ({ itens, proximoCursor });
function setup(mensagens = [mensagem("m1")]) {
  const leitor = {
    conversas: vi.fn().mockResolvedValue(pagina([conversa("c1")])),
    mensagens: vi.fn().mockResolvedValue(pagina(mensagens)),
  } satisfies LeitorHistoricoZernio;
  const conferencia = {
    conversaElegivel: vi.fn().mockResolvedValue(true),
    idsExistentes: vi.fn().mockResolvedValue(new Set<string>()),
  };
  const run = (tetoDeChamadas = 100) => calcularPreviaZernio(leitor, conferencia, { dias: 30, agora, tetoDeChamadas });
  return { leitor, conferencia, run };
}

describe("prévia Zernio limitada e sem escrita", () => {
  it("conta janela e formatos, sem devolver texto, participante ou segredo", async () => {
    const { run } = setup([
      mensagem("m1", { anexos: [{ type: "audio", url: "https://cdn.invalid/a" }] }),
      mensagem("m2", { anexos: [{ type: "image", url: "https://cdn.invalid/b" }] }),
      mensagem("antiga", { enviadaEm: "2025-11-01T12:00:00Z" }),
      mensagem("futura", { enviadaEm: "2026-11-14T12:00:00Z" }),
      mensagem("apagada", { texto: null, apagada: true, conteudoIndisponivel: true }),
    ]);
    const result = await run();
    expect(result).toMatchObject({ conversas: 1, mensagens: 3, audios: 1, imagens: 1, semConteudo: 1, parcial: false });
    expect(result.desde).toBe("2026-10-14T12:00:00.000Z");
    expect(JSON.stringify(result)).not.toMatch(/Texto sintético|p-c1|https:/);
  });

  it("consulta só conversas elegíveis e nunca lê grupo", async () => {
    const { leitor, conferencia, run } = setup();
    leitor.conversas.mockResolvedValue(pagina([conversa("fora"), { ...conversa("grupo"), grupo: true }, conversa("c1")]));
    conferencia.conversaElegivel.mockImplementation(async (c) => c.id === "c1");
    expect(await run()).toMatchObject({ conversas: 1, mensagens: 1 });
    expect(leitor.mensagens.mock.calls).toEqual([["c1", undefined]]);
    expect(conferencia.conversaElegivel).toHaveBeenCalledTimes(2);
  });

  it("a página curta não encerra a leitura se existe cursor", async () => {
    const { leitor, run } = setup();
    leitor.mensagens.mockResolvedValueOnce(pagina([mensagem("m1")], "mais")).mockResolvedValueOnce(pagina([mensagem("m2")]));
    expect(await run()).toMatchObject({ mensagens: 2, parcial: false });
    expect(leitor.mensagens).toHaveBeenLastCalledWith("c1", "mais");
  });

  it("não conta duas vezes a mesma thread ou mensagem repetida pelo provedor", async () => {
    const { leitor, conferencia, run } = setup();
    leitor.conversas.mockResolvedValueOnce(pagina([conversa("c1")], "outra-pagina")).mockResolvedValueOnce(pagina([conversa("c1")]));
    leitor.mensagens.mockResolvedValueOnce(pagina([mensagem("m1")], "mais")).mockResolvedValueOnce(pagina([mensagem("m1"), mensagem("m2")]));
    conferencia.idsExistentes.mockResolvedValue(new Set(["m2"]));
    expect(await run()).toMatchObject({ conversas: 1, mensagens: 2, repetidasNoProvedor: 1, existentesNoCrm: 1 });
  });

  it("recusa o mesmo ID de mensagem em duas threads", async () => {
    const { leitor, run } = setup();
    leitor.conversas.mockResolvedValue(pagina([conversa("c1"), conversa("c2")]));
    leitor.mensagens.mockResolvedValueOnce(pagina([mensagem("m1")])).mockResolvedValueOnce(pagina([mensagem("m1", { conversaId: "c2" })]));
    await expect(run()).rejects.toThrow("historico_identidade_em_conflito");
  });

  it("interrompe o ciclo A→B→A em cursores de conversa", async () => {
    const { leitor, run } = setup();
    leitor.conversas.mockResolvedValueOnce(pagina([], "A")).mockResolvedValueOnce(pagina([], "B")).mockResolvedValueOnce(pagina([], "A"));
    await expect(run()).rejects.toThrow("historico_cursor_repetido");
    expect(leitor.conversas).toHaveBeenCalledTimes(3);
  });

  it("interrompe ciclo em cursores de mensagens", async () => {
    const { leitor, run } = setup();
    leitor.mensagens.mockResolvedValue(pagina([], "repetida"));
    await expect(run()).rejects.toThrow("historico_cursor_repetido");
    expect(leitor.mensagens).toHaveBeenCalledTimes(2);
  });

  it("orçamento esgotado resulta parcial, nunca histórico completo", async () => {
    const { leitor, run } = setup();
    leitor.mensagens.mockResolvedValue(pagina([mensagem("m1")], "mais"));
    expect(await run(2)).toMatchObject({ parcial: true, mensagens: 1, chamadas: 2 });
    expect(leitor.mensagens).toHaveBeenCalledTimes(1);
  });

  it("não transforma falha na conferência do CRM em zero duplicatas", async () => {
    const { conferencia, run } = setup();
    conferencia.idsExistentes.mockRejectedValue(new Error("banco_indisponivel"));
    await expect(run()).rejects.toThrow("banco_indisponivel");
  });

  it("permanece parcial quando o teto termina na listagem de conversas", async () => {
    const { leitor, run } = setup();
    leitor.conversas.mockResolvedValue(pagina([conversa("c1")], "mais"));
    expect(await run(1)).toMatchObject({ parcial: true, mensagens: 0, chamadas: 1 });
    expect(leitor.mensagens).not.toHaveBeenCalled();
  });

  it("respeita o prazo total mesmo com chamadas restantes", async () => {
    const { leitor, conferencia } = setup();
    let tempo = 0;
    leitor.conversas.mockImplementation(async () => { tempo = 50_000; return pagina([conversa("c1")]); });
    const result = await calcularPreviaZernio(leitor, conferencia, { dias: 30, agora, relogio: () => tempo, prazoMs: 45_000 });
    expect(result).toMatchObject({ parcial: true, chamadas: 1 });
    expect(leitor.mensagens).not.toHaveBeenCalled();
  });
});
