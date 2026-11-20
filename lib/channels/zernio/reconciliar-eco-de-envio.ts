import type { SupabaseClient } from "@supabase/supabase-js";

import type { ZernioInboundMessage } from "./webhook";

const JANELA_DE_RECONCILIACAO_MS = 5 * 60 * 1000;

/**
 * Reusa uma única tentativa da IA quando o eco confirmado pelo provedor chega
 * depois de um timeout local. Só casa corpo, contato, conversa, sessão, janela
 * temporal e origem; se houver zero ou mais de uma candidata, deixa o eco ser
 * gravado como uma nova linha para não atribuir a entrega por palpite.
 */
export async function reconciliarEcoDeEnvio(
  admin: SupabaseClient,
  input: {
    organizationId: string;
    conversationId: string;
    contactId: string;
    channelSessionId: string;
    message: ZernioInboundMessage;
  },
): Promise<string | null> {
  const { message } = input;
  const sentAt = message.sentAt ? Date.parse(message.sentAt) : Number.NaN;
  if (
    message.kind !== "message" ||
    message.direction !== "outbound" ||
    message.sentVia !== "api" ||
    message.status !== "sent" ||
    !message.text ||
    message.attachments.length > 0 ||
    message.location ||
    !Number.isFinite(sentAt)
  ) {
    return null;
  }

  const desde = new Date(sentAt - JANELA_DE_RECONCILIACAO_MS).toISOString();
  const ate = new Date(sentAt + 30_000).toISOString();
  const { data: candidatas, error: erroDeBusca } = await admin
    .from("messages")
    .select("id")
    .eq("organization_id", input.organizationId)
    .eq("conversation_id", input.conversationId)
    .eq("contact_id", input.contactId)
    .eq("channel_session_id", input.channelSessionId)
    .eq("direction", "outbound")
    .eq("sent_via", "ai")
    .eq("body", message.text)
    .is("external_id", null)
    .in("status", ["queued", "sending", "failed"])
    .gte("created_at", desde)
    .lte("created_at", ate)
    .limit(2);

  if (erroDeBusca) throw new Error(`zernio_echo_reconcile_lookup_failed: ${erroDeBusca.message}`);
  if (!Array.isArray(candidatas) || candidatas.length !== 1) return null;

  const tentativa = candidatas[0] as { id?: string };
  if (!tentativa.id) return null;
  const { data, error } = await admin
    .from("messages")
    .update({
      external_id: message.externalId,
      status: "sent",
      sent_at: message.sentAt,
      error_code: null,
      error_message: null,
    })
    .eq("organization_id", input.organizationId)
    .eq("id", tentativa.id)
    .is("external_id", null)
    .in("status", ["queued", "sending", "failed"])
    .select("id")
    .maybeSingle();

  if (error) throw new Error(`zernio_echo_reconcile_update_failed: ${error.message}`);
  return (data as { id?: string } | null)?.id ?? null;
}
