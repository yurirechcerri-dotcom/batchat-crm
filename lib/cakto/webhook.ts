/**
 * Webhook da Cakto → etiquetas do contato (V1, 15/11/2026).
 *
 * Só o que a documentação garante (docs.cakto.com.br/conceitos/webhooks): corpo `{ secret, event, data }`,
 * assinatura `X-Cakto-Signature: v1=<hmac-sha256>` de `{timestamp}.{corpo cru}`, `data.id` único por pedido.
 * Reembolso e chargeback contam só por `refund` e `chargeback` — `refund_requested` NÃO vira reembolso.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

import { normalizarTag } from "@/lib/contacts/tag-normalizada";

export const TOLERANCIA_EM_SEGUNDOS = 5 * 60;

function iguais(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Prova de origem pelo cabeçalho (preferida) ou, na falta dele, pelo `secret` do corpo. */
export function origemValida(args: {
  corpoCru: string;
  timestamp: string | null;
  assinatura: string | null;
  secretDoCorpo: unknown;
  segredo: string;
  agora?: number;
}): boolean {
  const { corpoCru, timestamp, assinatura, secretDoCorpo, segredo } = args;
  if (!segredo) return false;
  if (timestamp && assinatura) {
    const ts = Number(timestamp);
    const agora = (args.agora ?? Date.now()) / 1000;
    if (!Number.isFinite(ts) || Math.abs(agora - ts) > TOLERANCIA_EM_SEGUNDOS) return false;
    const esperado = `v1=${createHmac("sha256", segredo).update(`${timestamp}.`).update(corpoCru).digest("hex")}`;
    return iguais(assinatura, esperado);
  }
  return typeof secretDoCorpo === "string" && iguais(secretDoCorpo, segredo);
}

const ETIQUETA_DO_EVENTO: Record<string, string> = {
  purchase_approved: "cakto-comprou",
  purchase_refused: "cakto-recusada",
  refund: "cakto-reembolso",
  chargeback: "cakto-chargeback",
  pix_gerado: "cakto-aguardando-pagamento",
  boleto_gerado: "cakto-aguardando-pagamento",
  pix_expirado: "cakto-pix-expirado",
  checkout_abandonment: "cakto-abandonou",
};

export interface DadosDoComprador {
  nome: string | null;
  email: string | null;
  telefone: string | null;
}

type Dados = Record<string, unknown>;
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** `data` pode ser objeto (webhook V1) ou lista (V2): usa o primeiro pedido. */
export function primeiroPedido(data: unknown): Dados | null {
  const d = Array.isArray(data) ? data[0] : data;
  return d && typeof d === "object" ? (d as Dados) : null;
}

export function compradorDoEvento(data: unknown): DadosDoComprador {
  const d = primeiroPedido(data);
  if (!d) return { nome: null, email: null, telefone: null };
  const c = (d.customer && typeof d.customer === "object" ? d.customer : {}) as Dados;
  return {
    nome: texto(c.name) ?? texto(d.customerName),
    email: texto(c.email) ?? texto(d.customerEmail),
    telefone: texto(c.phone) ?? texto(d.customerCellphone),
  };
}

/** Etiquetas a gravar: a do evento e a do produto. Evento desconhecido (ou `refund_requested`) → nenhuma. */
export function etiquetasDoEvento(event: unknown, data: unknown): string[] {
  const base = typeof event === "string" ? ETIQUETA_DO_EVENTO[event] : undefined;
  if (!base) return [];
  const produto = primeiroPedido(data)?.product as Dados | undefined;
  const nome = texto(produto?.short_id) ?? texto(produto?.name);
  const lista = [base];
  if (nome) lista.push(normalizarTag(`cakto-prod-${nome.replace(/\s+/g, "-")}`));
  return lista;
}

/** União sem repetir, na ordem: reenviar o mesmo evento não muda nada. */
export function unirEtiquetas(atuais: readonly string[], novas: readonly string[]): string[] {
  return [...new Set([...atuais, ...novas.map(normalizarTag)])];
}
