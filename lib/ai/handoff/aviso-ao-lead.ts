import type { ServiceBoundary } from "@/lib/atendimento/fronteira";
/**
 * Aviso ao cliente na passagem para humano pelo CRM (sentimento/tool MCP).
 * O motor pg tem emissor próprio; a frase é compartilhada em escalacao/aviso-ao-lead.
 * Chamado antes de silenciar. sendMessageHandler mantém as guardas do contato,
 * incluindo STOP. Falha no aviso nunca impede o registro da passagem humana.
 *
 * O histórico evita repetir aviso recente. Falha de conexão não prova ausência
 * de entrega: sem recusa anterior ao transporte, não se cria outro aviso.
 * Isso não é reconciliação nem um laço de retry e não resolve chamadas simultâneas.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { sendMessageHandler } from "@/app/api/v1/messages/_handler";
import {
  motivoDoAviso,
  textoDoAviso,
  type MotivoDoAviso as MotivoDaFrase,
} from "@/lib/escalacao/aviso-ao-lead";
import { comecaComPalavraDeSaida } from "@/lib/opt-out/deteccao";
import { lerFraseDoAvisoConfigurada } from "@/lib/escalacao/frase-do-aviso-configurada";
import { carregarRosterDeAtendimento, podeAssumirAgora } from "@/lib/escalacao/atendentes";
// Dois `MotivoDoAviso` no repositório: o de `escalacao/aviso-ao-lead` diz QUE
// FRASE o cliente lê; este diz POR QUE ele não leu nada. O apelido impede a
// confusão numa leitura rápida.
import type {
  DesfechoDoAvisoAoCliente,
  MotivoDoAviso as MotivoDoAvisoDaPassagem,
  OrigemDaPassagem,
} from "@/lib/escalacao/passagem";
import type { QuemPodeAssumir } from "@/lib/escalacao/disponibilidade";
import { logger } from "@/lib/logger";

/** Ator do envio — é o automático falando, não uma pessoa. */
const ATOR_DO_AVISO = "handoff-orchestrator";

/** Um aviso por conversa dentro desta janela (ver as guardas em `avisarLeadDoCrm`). */
const JANELA_DO_AVISO_MS = 24 * 60 * 60 * 1000;

export interface AvisoDoCrmInput {
  serviceBoundary?: ServiceBoundary;
  organizationId: string;
  conversationId: string;
  /** `contacts.id` — semente da variante do texto (nada dele aparece na frase). */
  contactId: string;
  /** `conversations.last_handoff_reason` que está sendo gravado agora. */
  reason: string;
  /**
   * Por onde a passagem entrou. Só `mcp_externo` muda algo aqui: ver a exceção
   * da guarda 1 em `avisarLeadDoCrm`.
   */
  origem?: OrigemDaPassagem;
}

/** Status de `messages` que significam "chegou ao cliente". */
const STATUS_ENTREGUE = new Set(["sent", "delivered", "read"]);

/** Recusas locais anteriores ao transporte; demais falhas têm entrega incerta. */
const FALHAS_ANTES_DO_TRANSPORTE = new Set([
  "pre_go_live", "pre_go_live_indisponivel", "channel_archived",
  "channel_disabled", "missing_phone_number", "storage_sign_failed",
]);

/**
 * O desfecho do aviso. É o MESMO tipo do outro emissor, por definição — ver
 * `DesfechoDoAvisoAoCliente`: enquanto eram dois, este lado tinha um
 * `{ avisado: boolean }` solto, e foi por essa folga que "avisado: true" passou
 * sem ninguém olhar o status da mensagem.
 */
export type DesfechoDoAvisoDoCrm = DesfechoDoAvisoAoCliente;

/**
 * `messages.error_code` → o motivo fechado. Parcial de propósito: código que não
 * está aqui vira "não avisado, motivo desconhecido", que é a verdade disponível.
 */
const CODIGO_DO_ERRO: Readonly<Record<string, MotivoDoAvisoDaPassagem>> = {
  pre_go_live: "pre_go_live",
  pre_go_live_indisponivel: "pre_go_live",
  channel_archived: "canal_arquivado",
  missing_phone_number: "sem_telefone",
};

/**
 * Avisa o lead. NUNCA lança: o orquestrador inteiro é fire-and-forget por
 * contrato ("nunca propaga exceção pro caller"), e um erro aqui não pode impedir
 * a passagem que ele antecede.
 *
 * ⚠️ **O QUE MUDOU, e por que era grave.** Esta função devolvia `avisado: true`
 * sempre que `sendMessageHandler` não LANÇAVA — e ele quase nunca lança: canal
 * em modo de teste, canal arquivado, contato sem telefone e recusa do transporte
 * viram `status='failed'` DENTRO da linha da mensagem, com `error_code`, e a
 * chamada volta normal. O resultado é que a Central afirmava "O cliente JÁ FOI
 * avisado" para uma pessoa que não recebeu nada, e o atendente abria a conversa
 * respondendo a alguém que não sabia que ele vinha. Agora o desfecho é lido do
 * `status` da mensagem devolvida, que é o único lugar onde ele existe.
 */
export async function avisarLeadDoCrm(
  admin: SupabaseClient,
  input: AvisoDoCrmInput,
): Promise<DesfechoDoAvisoDoCrm> {
  try {
    // Sem fala prévia da IA não existe retirada a anunciar. O próprio aviso
    // não conta como fala: impedir que um aviso indevido legitime o seguinte.
    // A janela de 24 h é consultada no banco, pois retriggers têm requestIds
    // novos. Erro de leitura fecha o envio; a passagem humana segue registrada.
    // A janela limita repetição sequencial, não serializa chamadas concorrentes.
    //
    // EXCEÇÃO da guarda 1 — `origem: "mcp_externo"`. Um agente externo
    // conectado por MCP com chave emitida pela tela (sem o escopo
    // `actor:ai_agent`, decisão de 19/09) tem as falas gravadas como
    // `sent_via='system'` (`origemDaMensagem` em `_handler.ts`), então a guarda
    // não as enxerga. Mas foi ele quem declarou a passagem — houve atendimento
    // automático — e o contrato de `crm_request_human_handoff` manda o agente
    // NÃO avisar, porque o aviso é deste lado. Sem a exceção, o cliente ficaria
    // sem aviso nenhum.
    const { data: falas, error: erroDasFalas } = await admin
      .from("messages")
      .select("metadata, created_at, status, error_code")
      .eq("organization_id", input.organizationId)
      .eq("conversation_id", input.conversationId)
      .eq("direction", "outbound")
      .eq("sent_via", "ai")
      .order("created_at", { ascending: false })
      .limit(20);
    if (erroDasFalas) {
      logger.warn("[handoff-orchestrator] falas da IA não lidas — aviso não enviado", {
        conversation_id: input.conversationId,
        error: erroDasFalas.message.slice(0, 200),
      });
      return { avisado: false, porque: "falas_da_ia_nao_lidas" };
    }
    const linhas = (falas ?? []) as {
      metadata: Record<string, unknown> | null;
      created_at: string;
      status: string | null;
      error_code?: string | null;
    }[];
    const iaJaFalou = linhas.some((m) => m.metadata?.aviso_de_escalacao !== true);
    if (!iaJaFalou && input.origem !== "mcp_externo") {
      return { avisado: false, porque: "ia_nunca_falou_nesta_conversa" };
    }
    // Falha genérica pode ter ocorrido DEPOIS de o canal aceitar o envio.
    // Só recusa local comprovada permite outra tentativa pelas guardas normais.
    const corte = Date.now() - JANELA_DO_AVISO_MS;
    const avisosRecentes = linhas.filter(
      (m) =>
        m.metadata?.aviso_de_escalacao === true &&
        (m.status !== "failed" || !FALHAS_ANTES_DO_TRANSPORTE.has(m.error_code ?? "")) &&
        new Date(m.created_at).getTime() > corte,
    );
    // O desfecho de quem é barrado diz a verdade sobre o aviso que JÁ existe —
    // senão a Central escreve "o cliente NÃO foi avisado (motivo desconhecido)"
    // para quem foi avisado há minutos.
    if (avisosRecentes.some((m) => STATUS_ENTREGUE.has(m.status ?? ""))) return { avisado: true };
    if (avisosRecentes.some((m) => m.status === "failed")) {
      return {
        avisado: false,
        porque: "entrega_do_aviso_incerta",
        motivoCodigo: "falhou_no_envio",
      };
    }
    if (avisosRecentes.length > 0) {
      return {
        avisado: false,
        porque: "aviso_ja_enviado_na_janela",
        motivoCodigo: "na_fila_canal_fora",
      };
    }

    // O aviso sai no idioma da ORGANIZAÇÃO (ver `textoDoAviso`). A leitura que
    // falha não pode derrubar o aviso: sem idioma, sai em português, como antes.
    let idioma: string | null = null;
    try {
      const { data: org } = await admin
        .from("organizations")
        .select("locale")
        .eq("id", input.organizationId)
        .maybeSingle();
      idioma = (org as { locale?: string | null } | null)?.locale ?? null;
    } catch {
      idioma = null;
    }
    const body = textoDoAviso(
      await motivoDaFrase(admin, input),
      await quemPodeAssumir(admin, input.organizationId),
      input.contactId,
      idioma,
      // #3725 — a frase do tenant, quando ele escreveu uma. Lida aqui porque
      // este emissor não tem turno: a conversa diz qual agente está ativo, e o
      // agente diz a frase. Falha de leitura ⇒ `null` ⇒ o padrão do produto;
      // um aviso de passagem nunca deixa de sair por causa de uma preferência.
      await fraseDoAgente(admin, input),
    );
    const mensagem = await sendMessageHandler(
      admin,
      {
        organization_id: input.organizationId,
        serviceBoundary: input.serviceBoundary,
        actor: { type: "ai_agent", id: ATOR_DO_AVISO, role: "manager" },
        requestId: `handoff-aviso-${input.conversationId}`,
      },
      {
        conversation_id: input.conversationId,
        type: "text",
        body,
        // A linha se DECLARA. Sem isto, no banco e na tela, este aviso é
        // indistinguível de uma fala do agente — e ele não é: é texto de
        // sistema, escrito em código, que sai no instante em que a IA se
        // retira. Quem audita a conversa depois precisa saber a diferença, e
        // quem escreve teste sobre este caminho também.
        metadata: { aviso_de_escalacao: true, handoff_reason: input.reason },
      },
    );
    if (mensagem.status === "sent") return { avisado: true };
    if (mensagem.status === "queued") {
      // `queued` é canal fora do ar OU instalação sem transporte configurado —
      // nos dois casos o cliente não recebeu nada e pode nunca receber. Chamar
      // isso de "avisado" é a promessa que quebrava a primeira frase de quem
      // assume a conversa.
      return {
        avisado: false,
        porque: "na_fila_canal_fora",
        motivoCodigo: "na_fila_canal_fora",
      };
    }
    const codigo = CODIGO_DO_ERRO[mensagem.error_code ?? ""] ?? "falhou_no_envio";
    return { avisado: false, porque: mensagem.error_code ?? "falhou_no_envio", motivoCodigo: codigo };
  } catch (err) {
    // PII fora do log: só o motivo da falha.
    const porque = err instanceof Error ? err.name : "erro_desconhecido";
    logger.warn("[handoff-orchestrator] aviso ao lead não saiu", {
      conversation_id: input.conversationId,
      error: err instanceof Error ? err.message.slice(0, 200) : String(err),
    });
    return { avisado: false, porque };
  }
}


/**
 * A frase própria do tenant (#3725): conversa → agente ativo → `ai_agents.config`.
 *
 * Duas leituras, e nenhuma delas pode custar o aviso: qualquer erro, campo
 * ausente ou agente sem frase devolve `null`, e `textoDoAviso` sai com o padrão
 * do produto. É a mesma direção de falha do resto do arquivo — o cliente ser
 * avisado importa mais do que o tom do aviso.
 */
async function fraseDoAgente(
  admin: SupabaseClient,
  input: AvisoDoCrmInput,
): Promise<string | null> {
  try {
    const { data: conversa } = await admin
      .from("conversations")
      .select("active_ai_agent_id")
      .eq("organization_id", input.organizationId)
      .eq("id", input.conversationId)
      .maybeSingle();
    const agentId = (conversa as { active_ai_agent_id?: string | null } | null)?.active_ai_agent_id;
    if (!agentId) return null;
    const { data: agente } = await admin
      .from("ai_agents")
      .select("config")
      .eq("organization_id", input.organizationId)
      .eq("id", agentId)
      .maybeSingle();
    return lerFraseDoAvisoConfigurada((agente as { config?: unknown } | null)?.config);
  } catch {
    return null;
  }
}

/**
 * Qual frase o cliente lê. Parte do motivo gravado (`last_handoff_reason`) e só
 * o troca num caso: o motivo é o GENÉRICO ("outro" — clima ruim, baixa
 * confiança…) e a última coisa que o cliente escreveu COMEÇA com a palavra de
 * saída ("Parar não é daqui"). Aí a frase é a de suspeita de opt-out — "Entendi.
 * Vou parar de te enviar mensagens automáticas por aqui." — e não "passei seu
 * pedido para um atendente humano. Fica por aqui que já te respondem.", que
 * promete atendimento a quem acabou de dizer que não quer mais mensagens.
 *
 * Medido em produção (30/09/2026): um lead respondeu "Parar não é daqui"; o
 * detector de bloqueio não casa (exige a palavra sozinha), o sentimento
 * escalou como `low_sentiment` e a frase genérica saiu. `pediu_humano` e
 * `orcamento_de_ia` têm frase própria e não são reavaliados.
 *
 * Leitura que falha devolve o motivo gravado: errar para o lado de como era antes.
 */
async function motivoDaFrase(
  admin: SupabaseClient,
  input: AvisoDoCrmInput,
): Promise<MotivoDaFrase> {
  const gravado = motivoDoAviso(input.reason);
  if (gravado !== "outro") return gravado;
  try {
    const { data } = await admin
      .from("messages")
      .select("body")
      .eq("organization_id", input.organizationId)
      .eq("conversation_id", input.conversationId)
      .eq("direction", "inbound")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const ultima = (data as { body?: string | null } | null)?.body ?? null;
    return comecaComPalavraDeSaida(ultima) ? "suspeita_de_opt_out" : gravado;
  } catch {
    return gravado;
  }
}

/**
 * Quantos podem assumir agora, no vocabulário que o texto espera.
 *
 * Reusa `carregarRosterDeAtendimento` + `podeAssumirAgora` — o par supabase-js
 * que a rota do painel e a capacidade do agente já usam. Não é um terceiro
 * leitor: é o MESMO predicado (`isAttendantEligible`) que o motor lê por `pg` em
 * `quemPodeAssumirAgora`. Duas portas, uma régua.
 *
 * `null` quando a leitura falha — e `textoDoAviso` lê `null` como "não prometa
 * prazo", que é a direção certa do erro.
 */
async function quemPodeAssumir(
  admin: SupabaseClient,
  organizationId: string,
): Promise<QuemPodeAssumir | null> {
  try {
    const agora = new Date();
    const roster = await carregarRosterDeAtendimento(admin, organizationId, agora);
    return {
      total: roster.length,
      disponiveis: roster.filter((a) => podeAssumirAgora(a, agora)).length,
    };
  } catch (err) {
    logger.warn("[handoff-orchestrator] disponibilidade não lida — aviso sem prazo", {
      organization_id: organizationId,
      error: err instanceof Error ? err.message.slice(0, 200) : String(err),
    });
    return null;
  }
}
