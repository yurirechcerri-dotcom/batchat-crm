import { createAdminClient } from "@/lib/supabase/admin";
import type { EventHandler, HandlerResult } from "@/lib/event-log/dispatcher";
import { classificarRadar, hashDoTexto } from "@/lib/radar/classificar";
import { textoDaMensagem } from "@/lib/radar/contrato";
import { ehContatoInterno } from "@/lib/contacts/tags-internas";
import { tagsInternasDaOrg } from "@/lib/schemas/settings";
import { MENSAGEM_REDIGIDA } from "@/lib/lgpd/cascata";

const KEY = "radar-comercial.v1";
const response = (status: HandlerResult["status"], detail: string): HandlerResult => ({
  consumer_key: KEY, status, detail,
  ...(status === "retry" ? { retry_at: new Date(Date.now() + 15_000).toISOString() } : {}),
});

async function pausar(org: string, message: string): Promise<HandlerResult> {
  const { data, error } = await createAdminClient().rpc("fn_radar_pause", { p_org: org, p_message: message });
  if (error) return response("error", "radar_pause_failed");
  return response(data === "pending" ? "retry" : "ok", `radar_pause_${String(data)}`);
}

export const radarComercialHandler: EventHandler = {
  key: KEY, naOrgParada: "pula", events: ["message.received"],
  async handle(row) {
    const admin = createAdminClient();
    const org = row.organization_id;
    const messageId = typeof row.payload.message_id === "string" ? row.payload.message_id : row.entity_id;
    if (!messageId) return response("skipped", "no_message");
    const { data: previous, error: previousError } = await admin.from("radar_analises")
      .select("status,pause_status").eq("organization_id", org).eq("message_id", messageId).maybeSingle();
    if (previousError) return response("error", "radar_read_failed");
    if (previous?.pause_status === "pending") return pausar(org, messageId);
    if (previous && previous.status !== "processing") return response("ok", "already_analyzed");
    const { data: cfg, error: cfgError } = await admin.from("radar_config").select("enabled,enabled_since")
      .eq("organization_id", org).maybeSingle();
    if (cfgError) return response("error", "radar_config_failed");
    if (!cfg?.enabled) return response("skipped", "radar_disabled");
    const { data: msg, error: msgError } = await admin.from("messages")
      .select("id,body,type,media_derived_text,media_derived_status,conversation_id,contact_id,direction,service_revision,created_at,metadata")
      .eq("organization_id", org).eq("id", messageId).maybeSingle();
    if (msgError) return response("error", "message_read_failed");
    if (!msg || msg.direction !== "inbound" || !msg.service_revision || msg.body === MENSAGEM_REDIGIDA ||
        Date.parse(msg.created_at) < Date.parse(cfg.enabled_since)) return response("skipped", "message_not_eligible");
    const { data: contact, error: contactError } = await admin.from("contacts")
      .select("is_anonymized,is_blocked,ai_opt_out,tags,organizations(settings)")
      .eq("organization_id", org).eq("id", msg.contact_id).maybeSingle();
    if (contactError) return response("error", "contact_read_failed");
    const tenant = contact?.organizations as { settings?: unknown } | null;
    if (!contact || contact.is_anonymized || contact.is_blocked || contact.ai_opt_out ||
        ehContatoInterno(contact.tags, tagsInternasDaOrg(tenant?.settings))) return response("skipped", "contact_not_eligible");
    const atual = textoDaMensagem(msg).slice(0, 6000);
    if (!atual && msg.type === "audio" && !["failed", "skipped"].includes(msg.media_derived_status ?? "") &&
        Date.now() - Date.parse(msg.created_at) < 180_000) return response("retry", "waiting_audio_transcription");
    if (!atual) return response("skipped", "no_customer_text");
    const { data: token, error: claimError } = await admin.rpc("fn_radar_claim", { p_org: org, p_message: messageId });
    if (claimError) return response("error", "radar_claim_failed");
    if (!token) return response(previous?.status === "processing" ? "retry" : "skipped", "not_claimed");
    try {
      const { data: history, error: historyError } = await admin.from("messages")
        .select("id,direction,body,type,media_derived_text,media_derived_status")
        .eq("organization_id", org).eq("conversation_id", msg.conversation_id)
        .eq("service_revision", msg.service_revision).lte("created_at", msg.created_at)
        .neq("id", msg.id).order("created_at", { ascending: false }).limit(8);
      if (historyError) throw new Error("context_read_failed");
      const context = (history ?? []).reverse().filter((m) => m.body !== MENSAGEM_REDIGIDA).map((m) => ({
        papel: m.direction === "inbound" ? "cliente" : "atendimento", texto: textoDaMensagem(m).slice(0, 600),
      }));
      const result = await classificarRadar(org, msg.contact_id, atual, context);
      const { data: saved, error } = await admin.rpc("fn_radar_finish", {
        p_org: org, p_message: messageId, p_token: token, p_hash: hashDoTexto(textoDaMensagem(msg)), p_result: result,
      });
      if (error || !saved) return response("error", "radar_save_failed");
      return pausar(org, messageId);
    } catch (error) {
      const allowed = ["context_read_failed", "orcamento_atingido", "modelo_indisponivel", "classificacao_falhou"];
      const code = error instanceof Error && allowed.includes(error.message) ? error.message : "classificacao_falhou";
      const { error: saveError } = await admin.rpc("fn_radar_finish", {
        p_org: org, p_message: messageId, p_token: token, p_hash: null, p_result: null, p_error: code,
      });
      return response(saveError ? "error" : "ok", code);
    }
  },
};
