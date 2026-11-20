/** Janela gravada pelo envio humano no CRM; não é uma pausa explícita do fluxo. */
export const HUMAN_REPLY_SILENCE_MS = 5 * 60 * 1000;

export function silencioDeRespostaManual(ate: string | null | undefined, envio: string | null | undefined, handoff?: string | null): boolean {
  if (!ate || !envio || ate === "infinity") return false;
  const fim = Date.parse(ate);
  const inicio = Date.parse(envio);
  if (!Number.isFinite(fim) || !Number.isFinite(inicio)) return false;
  // Handoff explícito posterior à resposta vence, mesmo se usar prazo finito.
  if (handoff && Date.parse(handoff) >= inicio) return false;
  return fim - inicio === HUMAN_REPLY_SILENCE_MS;
}

/** Mesma condição usada pelo leitor pg. Datas NULL nunca concedem exceção. */
export const SQL_SILENCIO_RESPOSTA_MANUAL = `exists (
  select 1 from messages m
   where m.organization_id = v.organization_id and m.conversation_id = v.id
     and m.direction = 'outbound'
     and (m.sent_by_user_id is not null or m.sent_on_behalf_of_user_id is not null)
     and m.sent_at = v.bot_silenced_until - interval '5 minutes'
     and (v.last_handoff_at is null or v.last_handoff_at < m.sent_at)
)`;
