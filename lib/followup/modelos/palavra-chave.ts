/**
 * AUTOMAÇÕES POR PALAVRA-CHAVE — o "responde com a palavra X" do ManyChat.
 *
 * ⚠️ COMO FUNCIONA (e por que são DUAS peças, não uma):
 *
 *  1. um FLUXO de follow-up (gatilho `manual`) com o texto já escrito — é ele
 *     que fala com o cliente, sempre o mesmo texto, sem IA no meio;
 *  2. uma REGRA de automação: gatilho `message.received` + condição "o texto da
 *     mensagem contém a palavra" + ação `start_message_flow` apontando para o
 *     fluxo. É a regra que "escuta" a palavra.
 *
 * A entrega é FIXA de propósito. O roteiro de atendimento (`settings.gatilhos`)
 * também liga por palavra, mas é conduzido pela IA no turno do agente — serve
 * para perguntar e coletar, não para garantir que o link saia.
 *
 * Nasce tudo PAUSADO: o fluxo é rascunho (quem publica é uma pessoa, depois de
 * ler o texto) e a regra nasce desligada (`is_active` nunca é aceito na criação).
 * Instalar não manda mensagem para ninguém.
 *
 * O texto é fixo (o modo `text` do nó não interpola): o link entra já escrito.
 */
import type { FlowGraph } from "@/lib/followup/graph-schema";

export const CANAIS_DE_PALAVRA = ["whatsapp", "instagram"] as const;
export type CanalDePalavra = (typeof CANAIS_DE_PALAVRA)[number];

export interface ModeloDePalavra {
  id: string;
  /** Vira o prefixo do nome do fluxo e da regra. */
  nome: string;
  /** O título curto do cartão: duas palavras, sem prefixo. */
  titulo: string;
  /** Uma frase, para o cartão da galeria. */
  resumo: string;
  /** Em quais canais o modelo é oferecido na galeria. */
  canais: readonly CanalDePalavra[];
  /** A palavra que a tela já sugere. A pessoa troca. */
  palavraPadrao: string;
  /** O texto que a tela já sugere. O link, quando há, entra numa linha própria no fim. */
  mensagemPadrao: string;
  /** O modelo pede um link? (a tela mostra o campo) */
  pedeLink: boolean;
}

export const MODELOS_DE_PALAVRA: readonly ModeloDePalavra[] = [
  {
    id: "palavra-entrega-material",
    nome: "Palavra-chave · entregar um material",
    titulo: "Entregar material",
    resumo: "A pessoa responde a palavra e recebe seu material grátis (PDF, guia, vídeo) na hora.",
    canais: ["whatsapp", "instagram"],
    palavraPadrao: "AGENTES",
    mensagemPadrao: "Oi! Aqui está o material que você pediu 👇",
    pedeLink: true,
  },
  {
    id: "palavra-enviar-link",
    nome: "Palavra-chave · enviar um link",
    titulo: "Enviar link",
    resumo: "A pessoa responde a palavra e recebe o link de agendamento, de compra ou do seu site.",
    canais: ["whatsapp", "instagram"],
    palavraPadrao: "QUERO",
    mensagemPadrao: "Perfeito! É só entrar por aqui 👇",
    pedeLink: true,
  },
  {
    id: "palavra-responder-duvida",
    nome: "Palavra-chave · responder uma dúvida",
    titulo: "Responder dúvida",
    resumo: "A pessoa pergunta por uma palavra (ex.: PREÇO) e recebe a resposta pronta.",
    canais: ["whatsapp", "instagram"],
    palavraPadrao: "PREÇO",
    mensagemPadrao: "Oi! Escreva aqui a resposta que você quer enviar.",
    pedeLink: false,
  },
];

export function modeloDePalavraPorId(id: string): ModeloDePalavra | undefined {
  return MODELOS_DE_PALAVRA.find((m) => m.id === id);
}

/** "agentes, Quero" → ["agentes", "Quero"]. Vírgula ou quebra de linha separam; vazios e repetidos caem. */
export function separarPalavras(texto: string): string[] {
  const vistas = new Set<string>();
  const saida: string[] = [];
  for (const bruta of texto.split(/[,\n;]/)) {
    const p = bruta.trim();
    const chave = p.toLowerCase();
    if (p === "" || vistas.has(chave)) continue;
    vistas.add(chave);
    saida.push(p);
  }
  return saida;
}

/** Coloca o link onde o texto marcou `[link]`; sem marca, ele vai numa linha própria no fim. */
export function comLink(mensagem: string, link: string | undefined): string {
  if (!link) return mensagem.replace(/\s*\[link\]/g, "").trim();
  if (mensagem.includes("[link]")) return mensagem.replaceAll("[link]", link);
  return `${mensagem.trimEnd()}\n${link}`;
}

/** Início → mensagem → fim. Uma mensagem só, sem espera e sem esperar resposta. */
export function montarGrafoDePalavra(mensagem: string): FlowGraph {
  return {
    nodes: [
      { id: "inicio", type: "trigger", label: "Início", position: { x: 0, y: 0 }, config: {} },
      {
        id: "mensagem",
        type: "action",
        label: "Envia a mensagem",
        position: { x: 260, y: 0 },
        config: { mode: "text", body: mensagem },
      },
      {
        id: "fim",
        type: "end",
        label: "Fim",
        position: { x: 520, y: 0 },
        config: { outcome: "custom", note: "A mensagem foi entregue; quem segue a conversa é o atendimento." },
      },
    ],
    edges: [
      { id: "inicio__mensagem__segue", source: "inicio", target: "mensagem", priority: 0, condition: { type: "always" } },
      { id: "mensagem__fim__segue", source: "mensagem", target: "fim", priority: 0, condition: { type: "always" } },
    ],
  };
}

/**
 * A regra que escuta a palavra. Mais de uma palavra = `any` (basta uma). O
 * avaliador compara em minúsculas, nos dois lados (`conditions.ts`).
 */
export function montarRegraDePalavra(entrada: { nome: string; palavras: string[]; flowPointerId: string }) {
  return {
    name: entrada.nome,
    trigger_event: "message.received" as const,
    conditions: {
      any: entrada.palavras.map((p) => ({ field: "event.body_preview", op: "contains" as const, value: p })),
    },
    actions: [
      {
        type: "start_message_flow" as const,
        config: { flow_pointer_id: entrada.flowPointerId, surface: "followup" as const, replace_live_flow: true },
      },
    ],
  };
}
