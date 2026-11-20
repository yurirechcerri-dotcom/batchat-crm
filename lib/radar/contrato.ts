import { z } from "zod";

export const categorias = ["nenhum", "interesse", "duvida", "compra", "negociacao", "humano"] as const;
export const classificacaoSchema = z.object({
  categoria: z.enum(categorias),
  confianca: z.enum(["baixa", "media", "alta"]),
  trecho: z.string().max(500),
});
export type Classificacao = z.infer<typeof classificacaoSchema>;
export const ROTULOS: Record<Classificacao["categoria"], string> = {
  nenhum: "Sem sinal", interesse: "Lead quente", duvida: "Dúvida do lead",
  compra: "Vontade de comprar", negociacao: "Negociação", humano: "Pediu atendimento humano",
};
export const ORIENTACOES: Record<Classificacao["categoria"], string> = {
  nenhum: "Nenhuma intervenção sugerida.",
  interesse: "Aproveite o interesse e confirme o objetivo antes de apresentar a oferta.",
  duvida: "Responda à dúvida destacada antes de avançar na oferta.",
  compra: "Entre para confirmar a contratação e conduzir o fechamento.",
  negociacao: "Entre para tratar preço, condições ou proposta pessoalmente.",
  humano: "Assuma a conversa e responda ao pedido da pessoa.",
};

/** O modelo sugere; evidência e autoridade são validadas fora dele. */
export function validarSinal(resultado: Classificacao, texto: string) {
  const inicio = texto.indexOf(resultado.trecho);
  if (resultado.categoria === "nenhum" || resultado.confianca === "baixa" ||
      resultado.trecho.trim().length < 3 || inicio < 0) return null;
  const normal = texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  // Conservador: contexto integral, não só o recorte que a IA escolheu.
  const negacao = /\b(nao|nunca|nem|desisti|talvez|disse|falou|exemplo|hipotetico)\b|["“”]/.test(normal);
  const hipotese = resultado.categoria !== "negociacao" && /\b(se eu|quando eu)\b/.test(normal);
  const explicito = resultado.categoria === "humano"
    ? /\b(quero|preciso|gostaria de) (falar|conversar) (com|diretamente com) (o |a |um |uma )?(yuri|humano|pessoa|atendente)|\b(chama|chame) (o |a |um |uma )?(yuri|humano|atendente)\b/.test(normal)
    : resultado.categoria === "compra"
      ? /\b(quero|vou|vamos|bora|decidi) (comprar|contratar|fechar|pagar)\b|\b(me )?(manda|envia|mande|envie) (o |a |seu |sua )?(pix|link de pagamento|chave pix)\b/.test(normal)
      : resultado.categoria === "negociacao"
        ? /\b(quero|podemos|vamos|preciso) negociar\b|\b(tem|consegue|faz|rola) (um |algum |mais )?desconto\b|\b(me )?(manda|envia|mande|envie) (uma |a )?proposta\b/.test(normal)
        : false;
  return {
    categoria: resultado.categoria, confianca: resultado.confianca,
    trecho_inicio: inicio, trecho_tamanho: resultado.trecho.length,
    pedir_pausa: resultado.confianca === "alta" && explicito && !negacao && !hipotese,
  };
}

export function textoDaMensagem(m: { body?: string | null; type?: string; media_derived_text?: string | null; media_derived_status?: string | null }) {
  if (m.body === "[mensagem anonimizada]") return "";
  if (m.body?.startsWith("[mensagem removida") || m.body?.startsWith("[Mensagem removida")) return "";
  if (m.type === "audio") return m.media_derived_status === "ready" ? (m.media_derived_text ?? "").trim() : "";
  return (m.body ?? "").trim();
}
