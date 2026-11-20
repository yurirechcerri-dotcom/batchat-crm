/**
 * A OPÇÃO POR FLUXO "enviar mesmo com a conversa atribuída a uma pessoa" (#3974).
 *
 * ─── O que a issue mediu ────────────────────────────────────────────────────
 *
 * Numa instalação real, de 28 inscrições de etapa 7 foram CANCELADAS com
 * `cancel_reason = 'pessoa_no_comando'` já na primeira mensagem, e só 2 clientes
 * receberam alguma coisa. O vendedor com a conversa atribuída é o caso NORMAL:
 * assumir, atribuir e transferir gravam `bot_silenced_until = 'infinity'`, então
 * `isLeadInHandoff` responde verdadeiro e a `handoff_policy` do fluxo (default
 * `pause`) adia para sempre ou cancela (`cancel`).
 *
 * ─── O recorte desta opção ──────────────────────────────────────────────────
 *
 * Ligada, vence a posse e o silêncio de uma resposta manual comprovada. Não vence,
 * e não pode vencer:
 *
 *   • `force_human` — handoff pedido pela IA ou pelo cliente. Enquanto o
 *     atendimento está passado para gente de propósito, o follow-up programado
 *     falar por cima é o defeito que `pessoa-no-comando-no-turno.ts` existe para
 *     evitar;
 *   • `ai_opt_out` — a marca permanente "sempre atendimento humano";
 *   • etiqueta de contato interno (equipe, sócio, fornecedor);
 *   • contato bloqueado e opt-out (barrados na cadeia de envio, como hoje);
 *   • as duas janelas de horário (canal e faixa do agente).
 *
 * E ela NÃO acorda a IA: o veto do turno (`bot_silenced_until` em
 * `inbound-turn.ts`) fica intocado. O que muda é o follow-up PROGRAMADO poder
 * sair; a resposta da IA à mensagem do cliente continua barrada.
 *
 * ─── A posse é `assigned_to_user_id`, a MESMA régua de `comando_da_conversa` ─
 *
 * "Com uma pessoa" é a definição canônica do banco (`fn_comando_da_conversa`:
 * dono primeiro), não "está calada": conversa atribuída pelo rodízio também tem
 * dono, e é justamente uma das que hoje morrem no gate (`conversa_de_humano`).
 *
 * Uma resposta manual no CRM cria silêncio de 5 minutos só para a IA. Com
 * esta opção ligada, esse carimbo exato não pausa a esteira fixa, mesmo sem
 * responsável atribuído. Pausa explícita, handoff posterior e silêncio de
 * outra origem continuam bloqueando. Pausar o fluxo mantém `paused_manual`.
 *
 * ─── Dois transportes, UMA regra ────────────────────────────────────────────
 *
 * O turno do worker fala `pg`; o atalho inline (`enviarTextoFixoPendente`) fala
 * `supabase-js`. Os dois leitores devolvem o MESMO `EstadoDoComando`, e quem
 * decide é a função pura `opcaoLiberaEnvio` — a mesma disciplina de
 * `lib/ai/elegibilidade/` (dois transportes, uma regra), porque duas cópias da
 * decisão divergem na primeira correção.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type pg from "pg";

import { ehContatoInterno, sqlContatoInterno } from "@/lib/contacts/tags-internas";
import { tagsInternasDaOrg } from "@/lib/schemas/settings";
import { instanteDoBanco } from "@/lib/tempo/agora";
import { HUMAN_REPLY_SILENCE_MS, silencioDeRespostaManual, SQL_SILENCIO_RESPOSTA_MANUAL } from "./silencio-de-resposta-manual";

/** O que a régua da posse precisa saber do contato e das conversas dele. */
export interface EstadoDoComando {
  /** `force_human`, `ai_opt_out`, `is_blocked` ou etiqueta de contato interno. A opção NÃO vence. */
  contatoVetado: boolean;
  /** Existe conversa ABERTA do contato com uma pessoa como dona (`assigned_to_user_id`). */
  conversaComDono: boolean;
  /** Existe conversa calada SEM dono por motivo diferente da resposta manual comprovada. */
  conversaSilenciadaSemDono: boolean;
  respostaManualRecente?: boolean;
}

/**
 * A REGRA. `true` = o envio programado pode sair apesar de haver uma pessoa no
 * comando. `false` = vale o comportamento de sempre (cancela ou adia).
 *
 * `estado` nulo (contato sumiu, leitura vazia) NUNCA libera: a opção é uma
 * exceção estreita, e exceção sem o dado que a justifica não existe.
 */
export function opcaoLiberaEnvio(opcao: boolean, estado: EstadoDoComando | null): boolean {
  if (!opcao || estado === null) return false;
  return (
    !estado.contatoVetado && (estado.conversaComDono || estado.respostaManualRecente === true) && !estado.conversaSilenciadaSemDono
  );
}

/** A opção gravada no fluxo da inscrição (coluna `followup_flow_pointers.send_when_assigned`). */
export async function lerOpcaoDaInscricao(
  pool: pg.Pool,
  p: { organizationId: string; enrollmentId: string | null | undefined },
): Promise<boolean> {
  if (!p.enrollmentId) return false;
  const { rows } = await pool.query<{ send_when_assigned: boolean }>(
    `select p.send_when_assigned
       from followup_enrollments e
       join followup_flow_pointers p
         on p.id = e.pointer_id and p.organization_id = e.organization_id
      where e.organization_id = $1 and e.id = $2`,
    [p.organizationId, p.enrollmentId],
  );
  return rows[0]?.send_when_assigned === true;
}

/** O estado do comando pelo pool `pg` (turno do worker e checagem por ocupação do nó). */
export async function lerEstadoDoComando(
  db: pg.Pool,
  p: { organizationId: string; contactId: string },
): Promise<EstadoDoComando | null> {
  const { rows } = await db.query<{
    contato_vetado: boolean;
    com_dono: boolean;
    outro_silenciado: boolean;
    resposta_manual: boolean;
  }>(
    `select
       (c.force_human or c.ai_opt_out or c.is_blocked or ${sqlContatoInterno("c")}) as contato_vetado,
       exists (
         select 1 from conversations v
          where v.organization_id = c.organization_id and v.contact_id = c.id
            and v.status not in ('closed', 'archived', 'resolved')
            and v.bot_silenced_until > now() and ${SQL_SILENCIO_RESPOSTA_MANUAL}
       ) as resposta_manual,
       exists (
         select 1 from conversations v
          where v.organization_id = c.organization_id and v.contact_id = c.id
            and v.assigned_to_user_id is not null
            and v.status not in ('closed', 'archived', 'resolved')
       ) as com_dono,
       exists (
         select 1 from conversations v
          where v.organization_id = c.organization_id and v.contact_id = c.id
            and v.bot_silenced_until is not null and v.bot_silenced_until > now()
            and (v.assigned_to_user_id is null or v.metadata->>'radar_pause_pending' = 'true')
            and not (${SQL_SILENCIO_RESPOSTA_MANUAL})
            and v.status not in ('closed', 'archived', 'resolved')
       ) as outro_silenciado
     from contacts c
     where c.organization_id = $1 and c.id = $2`,
    [p.organizationId, p.contactId],
  );
  const linha = rows[0];
  if (!linha) return null;
  return {
    contatoVetado: linha.contato_vetado === true,
    conversaComDono: linha.com_dono === true,
    conversaSilenciadaSemDono: linha.outro_silenciado === true,
    ...(linha.resposta_manual === true ? { respostaManualRecente: true } : {}),
  };
}

/**
 * A decisão completa pelo `pg`: lê a opção e, só quando ela está ligada, o
 * estado do comando. Desligada (ou sem inscrição), paga UMA consulta e devolve
 * `false` — o caminho de quem não usa a opção continua o de hoje.
 */
export async function liberaEnvioComODono(
  pool: pg.Pool,
  p: { organizationId: string; contactId: string; enrollmentId: string | null | undefined },
): Promise<boolean> {
  if (!(await lerOpcaoDaInscricao(pool, p))) return false;
  return opcaoLiberaEnvio(true, await lerEstadoDoComando(pool, { ...p }));
}

/** A mesma opção, pelo `supabase-js` do atalho inline. */
export async function lerOpcaoDaInscricaoViaSupabase(
  admin: Pick<SupabaseClient, "from">,
  p: { organizationId: string; enrollmentId: string | null | undefined },
): Promise<boolean> {
  if (!p.enrollmentId) return false;
  const { data: inscricao, error } = await admin
    .from("followup_enrollments")
    .select("pointer_id")
    .eq("organization_id", p.organizationId)
    .eq("id", p.enrollmentId)
    .maybeSingle();
  if (error) throw new Error(`envio-com-dono: leitura da inscrição falhou — ${error.message}`);
  const pointerId = (inscricao as { pointer_id?: string | null } | null)?.pointer_id ?? null;
  if (!pointerId) return false;

  const { data: fluxo, error: erroDoFluxo } = await admin
    .from("followup_flow_pointers")
    .select("send_when_assigned")
    .eq("organization_id", p.organizationId)
    .eq("id", pointerId)
    .maybeSingle();
  if (erroDoFluxo) throw new Error(`envio-com-dono: leitura do fluxo falhou — ${erroDoFluxo.message}`);
  return (fluxo as { send_when_assigned?: boolean } | null)?.send_when_assigned === true;
}

/** O estado do comando pelo `supabase-js`. */
export async function lerEstadoDoComandoViaSupabase(
  admin: Pick<SupabaseClient, "from">,
  p: { organizationId: string; contactId: string },
): Promise<EstadoDoComando | null> {
  const { data: contato, error: erroDoContato } = await admin
    .from("contacts")
    .select("force_human, ai_opt_out, is_blocked, tags, organizations:organization_id(settings)")
    .eq("organization_id", p.organizationId)
    .eq("id", p.contactId)
    .maybeSingle();
  if (erroDoContato) {
    throw new Error(`envio-com-dono: leitura do contato falhou — ${erroDoContato.message}`);
  }
  if (!contato) return null;

  const linha = contato as unknown as {
    force_human: boolean | null;
    ai_opt_out: boolean | null;
    is_blocked: boolean | null;
    tags: string[] | null;
    organizations: { settings?: unknown } | null;
  };

  const { data: conversas, error: erroDasConversas } = await admin
    .from("conversations")
    .select("id, assigned_to_user_id, bot_silenced_until, status, last_outbound_at, last_handoff_at, metadata")
    .eq("organization_id", p.organizationId)
    .eq("contact_id", p.contactId);
  if (erroDasConversas) {
    throw new Error(`envio-com-dono: leitura das conversas falhou — ${erroDasConversas.message}`);
  }

  const agora = Date.now();
  let conversaComDono = false;
  let conversaSilenciadaSemDono = false;
  let respostaManualRecente = false;
  for (const conversa of (conversas ?? []) as Array<{
    id: string;
    assigned_to_user_id: string | null;
    bot_silenced_until: string | null;
    status: string | null;
    last_outbound_at?: string | null;
    last_handoff_at?: string | null;
    metadata?: { radar_pause_pending?: boolean };
  }>) {
    const encerrada = conversa.status === "closed" || conversa.status === "archived" || conversa.status === "resolved";
    if (encerrada) continue;
    if (conversa.metadata?.radar_pause_pending === true) conversaSilenciadaSemDono = true;
    if (conversa.assigned_to_user_id !== null) conversaComDono = true;
    const ate = conversa.bot_silenced_until;
    if (ate === null || conversa.assigned_to_user_id !== null) continue;
    // O Postgres devolve `'infinity'` como string, e `instanteDoBanco` a lê como
    // ilegível (`null`); por isso ela é conferida antes.
    const fim = instanteDoBanco(ate);
    if (ate === "infinity" || (fim !== null && new Date(fim).getTime() > agora)) {
      let manual = false;
      if (fim !== null && conversa.id && conversa.last_outbound_at) {
        const origem = new Date(new Date(fim).getTime() - HUMAN_REPLY_SILENCE_MS).toISOString();
        if (silencioDeRespostaManual(ate, origem, conversa.last_handoff_at)) {
          const { data, error } = await admin.from("messages")
            .select("id").eq("organization_id", p.organizationId).eq("conversation_id", conversa.id)
            .eq("direction", "outbound").eq("sent_at", origem)
            .or("sent_by_user_id.not.is.null,sent_on_behalf_of_user_id.not.is.null").limit(1);
          if (error) throw new Error(`envio-com-dono: origem do silêncio indisponível — ${error.message}`);
          manual = (data?.length ?? 0) > 0;
        }
      }
      if (manual) respostaManualRecente = true;
      else conversaSilenciadaSemDono = true;
    }
  }

  return {
    contatoVetado:
      linha.force_human === true ||
      linha.ai_opt_out === true ||
      linha.is_blocked === true ||
      ehContatoInterno(linha.tags, tagsInternasDaOrg(linha.organizations?.settings)),
    conversaComDono,
    conversaSilenciadaSemDono,
    ...(respostaManualRecente ? { respostaManualRecente: true } : {}),
  };
}

/**
 * A decisão completa pelo `supabase-js` do atalho inline. Falha de leitura SOBE
 * — quem chama trata como "não libera" (fail-closed), a mesma disciplina do
 * gate de elegibilidade.
 */
export async function liberaEnvioComODonoViaSupabase(
  admin: Pick<SupabaseClient, "from">,
  p: { organizationId: string; contactId: string; enrollmentId: string | null | undefined },
): Promise<boolean> {
  if (!(await lerOpcaoDaInscricaoViaSupabase(admin, p))) return false;
  return opcaoLiberaEnvio(true, await lerEstadoDoComandoViaSupabase(admin, p));
}
