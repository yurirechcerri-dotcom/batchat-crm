import { socialRequest } from "../social/client";
import {
  paginaConversasZernioSchema,
  paginaMensagensZernioSchema,
  type ConversaZernio,
  type MensagemZernio,
} from "./zernio-schema";

/** Escopo resolvido da sessão autorizada, nunca de IDs enviados livremente pela tela. */
export interface EscopoHistoricoZernio {
  contaId: string;
  perfilId: string;
  plataforma: "whatsapp" | "instagram" | "facebook";
}

export interface PaginaHistorico<T> {
  itens: T[];
  proximoCursor: string | null;
}

export interface ConversaHistorico {
  id: string;
  participanteId: string;
  bsuid: string | null;
  nome: string | null;
  foto?: string | null;
  atualizadaEm: string;
  grupo: boolean;
  conteudoIndisponivel: boolean;
}

export interface MensagemHistorico {
  /** ID da plataforma: wamid/mid, igual a platformMessageId no webhook. */
  id: string;
  conversaId: string;
  remetenteId: string;
  direcao: "inbound" | "outbound";
  enviadaEm: string;
  texto: string | null;
  anexos: MensagemZernio["attachments"];
  apagada: boolean;
  conteudoIndisponivel: boolean;
}

export interface LeitorHistoricoZernio {
  conversas(cursor?: string): Promise<PaginaHistorico<ConversaHistorico>>;
  mensagens(conversaId: string, cursor?: string): Promise<PaginaHistorico<MensagemHistorico>>;
}

function proximo(pagina: { hasMore: boolean; nextCursor?: string | null }, atual?: string): string | null {
  if (!pagina.hasMore) return null;
  if (!pagina.nextCursor || pagina.nextCursor === atual) throw new Error("historico_cursor_sem_avanco");
  return pagina.nextCursor;
}

function conferirEscopo(item: { accountId: string; platform: string }, escopo: EscopoHistoricoZernio): void {
  if (item.accountId !== escopo.contaId || item.platform !== escopo.plataforma) {
    throw new Error("historico_escopo_divergente");
  }
}

function normalizarConversa(c: ConversaZernio): ConversaHistorico {
  return {
    id: c.id,
    participanteId: c.participantId,
    bsuid: c.businessScopedUserId ?? null,
    nome: c.contentNotRetained ? null : (c.participantName ?? null),
    ...(c.participantPicture ? { foto: c.participantPicture } : {}),
    atualizadaEm: c.updatedTime,
    grupo: c.isGroup === true,
    conteudoIndisponivel: c.contentNotRetained === true,
  };
}

function normalizarMensagem(m: MensagemZernio): MensagemHistorico {
  // Zernio pode devolver o corpo original mesmo após isDeleted. Não o ressuscitar.
  const indisponivel = m.isDeleted === true || m.contentNotRetained === true || m.noRenderableContent === true;
  return {
    id: m.id,
    conversaId: m.conversationId,
    remetenteId: m.senderId,
    direcao: m.direction === "incoming" ? "inbound" : "outbound",
    enviadaEm: m.createdAt,
    texto: indisponivel ? null : m.message,
    anexos: indisponivel ? [] : m.attachments,
    apagada: m.isDeleted === true,
    conteudoIndisponivel: indisponivel,
  };
}

/**
 * Apenas GET. Não marca lida, não toma controle da thread e não chama o ingestor.
 * HTTP/redirect/timeout seguem a fronteira canônica socialRequest.
 * O consumidor limita a varredura e detecta ciclos entre páginas não adjacentes.
 */
export function criarLeitorZernio(entrada: EscopoHistoricoZernio & { chave: string; signal?: AbortSignal }): LeitorHistoricoZernio {
  const { chave, signal, ...escopo } = entrada;
  if (!chave || !escopo.contaId || !escopo.perfilId) throw new Error("historico_credencial_incompleta");
  const query = (cursor?: string) => {
    const q = new URLSearchParams({ accountId: escopo.contaId, profileId: escopo.perfilId, limit: "100", sortOrder: "asc" });
    if (cursor !== undefined) q.set("cursor", cursor);
    return q;
  };
  return {
    async conversas(cursor) {
      const q = query(cursor);
      q.set("platform", escopo.plataforma);
      signal?.throwIfAborted();
      const parsed = paginaConversasZernioSchema.safeParse(await socialRequest(chave, `inbox/conversations?${q}`, undefined, "GET", signal));
      if (!parsed.success) throw new Error("historico_resposta_invalida");
      const { data, pagination, meta } = parsed.data;
      if (meta.accountsQueried !== 1 || meta.accountsFailed !== 0 || meta.failedAccounts?.length || meta.accountsSkipped?.length) {
        throw new Error("historico_conta_indisponivel");
      }
      for (const item of data) conferirEscopo(item, escopo);
      return { itens: data.map(normalizarConversa), proximoCursor: proximo(pagination, cursor) };
    },
    async mensagens(conversaId, cursor) {
      if (!conversaId) throw new Error("historico_conversa_invalida");
      const path = `inbox/conversations/${encodeURIComponent(conversaId)}/messages?${query(cursor)}`;
      signal?.throwIfAborted();
      const parsed = paginaMensagensZernioSchema.safeParse(await socialRequest(chave, path, undefined, "GET", signal));
      if (!parsed.success) throw new Error("historico_resposta_invalida");
      for (const item of parsed.data.messages) {
        conferirEscopo(item, escopo);
        if (item.conversationId !== conversaId) throw new Error("historico_escopo_divergente");
      }
      return { itens: parsed.data.messages.map(normalizarMensagem), proximoCursor: proximo(parsed.data.pagination, cursor) };
    },
  };
}
