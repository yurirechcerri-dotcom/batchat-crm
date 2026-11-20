import { beforeEach, describe, expect, it, vi } from "vitest";
import { socialRequest, SocialError } from "../social/client";
import type * as SocialClient from "../social/client";
import { criarLeitorZernio } from "./zernio-leitura";

vi.mock("../social/client", async (original) => ({
  ...(await original<typeof SocialClient>()),
  socialRequest: vi.fn(),
}));

const request = vi.mocked(socialRequest);
const leitor = () => criarLeitorZernio({ chave: "chave-de-teste", contaId: "conta-a", perfilId: "perfil-a", plataforma: "whatsapp" });
const conversa = (overrides = {}) => ({
  id: "thread/opaca?1", accountId: "conta-a", platform: "whatsapp",
  participantId: "5511999990000", participantName: "Pessoa de teste",
  updatedTime: "2026-11-01T12:00:00Z", ...overrides,
});
const mensagem = (overrides = {}) => ({
  id: "wamid.opaco", accountId: "conta-a", conversationId: "thread/opaca?1", platform: "whatsapp",
  senderId: "5511999990000", direction: "incoming", createdAt: "2026-10-02T12:00:00Z",
  message: "Texto de teste", attachments: [], ...overrides,
});
const paginaConversas = (data = [conversa()], pagination = { hasMore: false, nextCursor: null as string | null }) => ({
  data, pagination, meta: { accountsQueried: 1, accountsFailed: 0, failedAccounts: [] },
});
const paginaMensagens = (messages = [mensagem()]) => ({
  messages, pagination: { hasMore: false, nextCursor: null }, sortOrderApplied: "asc",
});
beforeEach(() => vi.clearAllMocks());

describe("leitura de histórico Zernio, sem efeitos", () => {
  it("fixa conta/perfil e preserva cursor opaco; não chama endpoints de escrita", async () => {
    request.mockResolvedValue(paginaConversas());
    const pagina = await leitor().conversas("cursor/+?opaco");
    const [key, path, ...extra] = request.mock.calls[0]!;
    const url = new URL(path, "https://teste.invalid/");
    expect(key).toBe("chave-de-teste");
    expect(url.pathname).toBe("/inbox/conversations");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ accountId: "conta-a", profileId: "perfil-a", platform: "whatsapp", cursor: "cursor/+?opaco", limit: "100" });
    expect(extra).toEqual([undefined, "GET", undefined]);
    expect(pagina.itens[0]?.id).toBe("thread/opaca?1");
    expect(pagina.proximoCursor).toBeNull();
    expect(JSON.stringify(pagina)).not.toContain("chave-de-teste");
  });

  it.each([{ accountId: "outra-conta" }, { platform: "instagram" }])("recusa página de outra conta/plataforma: %j", async (other) => {
    request.mockResolvedValue(paginaConversas([conversa(), conversa(other)]));
    await expect(leitor().conversas()).rejects.toThrow("historico_escopo_divergente");
  });

  it("não apresenta falha parcial de conta como lista vazia completa", async () => {
    request.mockResolvedValue({ ...paginaConversas([]), meta: { accountsQueried: 1, accountsFailed: 1 } });
    await expect(leitor().conversas()).rejects.toThrow("historico_conta_indisponivel");
  });

  it.each([null, "atual"])("recusa hasMore sem avanço de cursor: %s", async (nextCursor) => {
    request.mockResolvedValue(paginaConversas([], { hasMore: true, nextCursor }));
    await expect(leitor().conversas("atual")).rejects.toThrow("historico_cursor_sem_avanco");
  });

  it("codifica o identificador da conversa e mantém a data original da mensagem", async () => {
    request.mockResolvedValue(paginaMensagens());
    const pagina = await leitor().mensagens("thread/opaca?1");
    const [, path] = request.mock.calls[0]!;
    const url = new URL(path, "https://teste.invalid/");
    expect(url.pathname).toBe("/inbox/conversations/thread%2Fopaca%3F1/messages");
    expect(url.searchParams.get("accountId")).toBe("conta-a");
    expect(url.searchParams.get("sortOrder")).toBe("asc");
    expect(pagina.itens[0]).toMatchObject({ id: "wamid.opaco", conversaId: "thread/opaca?1", enviadaEm: "2026-10-02T12:00:00Z", direcao: "inbound", texto: "Texto de teste" });
  });

  it.each([{ conversationId: "outra-thread" }, { accountId: "outra-conta" }, { platform: "instagram" }])("não mistura mensagens no histórico: %j", async (other) => {
    request.mockResolvedValue(paginaMensagens([mensagem(other)]));
    await expect(leitor().mensagens("thread/opaca?1")).rejects.toThrow("historico_escopo_divergente");
  });

  it.each([{ id: "" }, { createdAt: "ontem" }, { direction: "unknown" }])("falha explicitamente quando falta identidade/data/direção: %j", async (invalid) => {
    request.mockResolvedValue(paginaMensagens([mensagem(invalid)]));
    await expect(leitor().mensagens("thread/opaca?1")).rejects.toThrow("historico_resposta_invalida");
  });

  it.each(["contentNotRetained", "isDeleted", "noRenderableContent"])("não ressuscita conteúdo indisponível: %s", async (flag) => {
    request.mockResolvedValue(paginaMensagens([mensagem({ [flag]: true, message: "CONTEUDO_REMOVIDO", attachments: [{ type: "image", url: "https://cdn.invalid/CONTEUDO_REMOVIDO" }] })]));
    const pagina = await leitor().mensagens("thread/opaca?1");
    expect(pagina.itens[0]).toMatchObject({ texto: null, anexos: [], conteudoIndisponivel: true });
    expect(JSON.stringify(pagina)).not.toContain("CONTEUDO_REMOVIDO");
  });

  it.each([401, 403, 429])("propaga recusa HTTP %i sem converter em histórico vazio", async (status) => {
    const error = new SocialError("Acesso recusado", status === 429 ? 429 : 502, status);
    request.mockRejectedValue(error);
    await expect(leitor().conversas()).rejects.toBe(error);
    expect(request).toHaveBeenCalledTimes(1);
  });
});
