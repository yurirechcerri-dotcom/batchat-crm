/**
 * Fim do SILÊNCIO CURTO de resposta humana, quando é só ele que cala a IA: os 5 min de
 * quem respondeu pelo CRM e os 60 min (ajuste da empresa) de quem respondeu pelo celular.
 *
 * Por quê: o turno de resposta a uma mensagem do cliente é um NO-OP quando a IA está
 * calada. Com o silêncio longo (assumir, transferir) isso é o desenho: só a pessoa
 * devolve. Com o silêncio curto (a pessoa respondeu há instantes) o cliente que
 * escreveu DENTRO da janela ficava sem resposta até escrever de novo, porque nada
 * acordava o turno quando o silêncio vencia. Quem chama adia o MESMO job para o fim.
 *
 * Devolve `null` para qualquer outra trava (infinity, force_human, pausa explícita,
 * handoff posterior à resposta): nesses casos o turno continua pulado como antes.
 */
import type { Queryable } from '../queue/queue';
import { SQL_SILENCIO_RESPOSTA_MANUAL } from '@/lib/followup/silencio-de-resposta-manual';
import { MOTIVO_ATENDIMENTO_MANUAL } from '@/lib/escalacao/atendimento-manual';

export const FOLGA_DO_FIM_DO_SILENCIO_MS = 2_000;

export async function fimDoSilencioCurto(
  db: Queryable,
  organizationId: string,
  conversationId: string | null | undefined,
): Promise<Date | null> {
  if (!conversationId) return null;
  try {
    const r = await db.query(
      `select v.bot_silenced_until as ate
         from conversations v
        where v.id = $1 and v.organization_id = $2
          and v.bot_silenced_until is not null
          and v.bot_silenced_until > now()
          and v.bot_silenced_until <> 'infinity'
          and (
            ${SQL_SILENCIO_RESPOSTA_MANUAL}
            or (v.last_handoff_reason = $3 and v.last_handoff_at is not null
                and v.assigned_to_user_id is null)
          )
          -- só adia se a última palavra é do cliente: se a pessoa já respondeu depois,
          -- responder a mensagem velha seria falar por cima dela.
          and (select m2.direction from messages m2
                where m2.conversation_id = v.id and m2.organization_id = v.organization_id
                order by m2.sent_at desc, m2.created_at desc limit 1) = 'inbound'`,
      [conversationId, organizationId, MOTIVO_ATENDIMENTO_MANUAL],
    );
    const ate = (r.rows as Array<{ ate: Date | string }>)[0]?.ate;
    if (!ate) return null;
    const d = new Date(ate);
    return Number.isFinite(d.getTime()) ? d : null;
  } catch {
    return null; // best-effort: na dúvida, o comportamento de antes (pular)
  }
}
