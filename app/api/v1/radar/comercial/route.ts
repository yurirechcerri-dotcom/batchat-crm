import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createClient } from "@/lib/supabase/server";
import { audit } from "@/lib/audit";
import { textoDaMensagem } from "@/lib/radar/contrato";
import type { RadarData, RadarItem } from "@/lib/radar/tipos";

export const dynamic = "force-dynamic";
const configSchema = z.object({ enabled: z.boolean().optional(), auto_pause: z.boolean().optional(), notify_sexta: z.boolean().optional() }).strict();
const mutationSchema = z.union([z.object({ config: configSchema }).strict(), z.object({ resolve: z.string().uuid() }).strict()]);

export async function GET() {
  const requestId = randomUUID();
  const auth = await requireRole("agent", { requestId, resource: "radar_comercial" });
  if (!auth.ok) return auth.response;
  const db = await createClient();
  const org = auth.org.orgId;
  const [{ data: config, error: configError }, { data: rows, error }] = await Promise.all([
    db.from("radar_config").select("enabled,auto_pause,notify_sexta").eq("organization_id", org).maybeSingle(),
    db.from("radar_analises").select("id,conversation_id,message_id,category,confidence,source_hash,excerpt_start,excerpt_length,pause_status,notify_status,created_at,error_code")
      .eq("organization_id", org).is("resolved_at", null).or("category.neq.nenhum,status.eq.failed")
      .order("created_at", { ascending: false }).limit(60),
  ]);
  if (error || configError) return fail("internal_error", "Não foi possível carregar os sinais.", 500, { requestId });
  const ids = (rows ?? []).map((r) => r.message_id);
  const messages = ids.length ? await db.from("messages").select("id,body,type,media_derived_text,media_derived_status,contact_id")
    .eq("organization_id", org).in("id", ids) : { data: [], error: null };
  if (messages.error) return fail("internal_error", "Não foi possível ler a evidência.", 500, { requestId });
  const contactIds = [...new Set((messages.data ?? []).map((m) => m.contact_id))];
  const contacts = contactIds.length ? await db.from("contacts").select("id,name,is_anonymized")
    .eq("organization_id", org).in("id", contactIds) : { data: [], error: null };
  if (contacts.error) return fail("internal_error", "Não foi possível ler os contatos.", 500, { requestId });
  const items: RadarItem[] = [];
  for (const row of rows ?? []) {
    const message = messages.data?.find((m) => m.id === row.message_id);
    const contact = contacts.data?.find((c) => c.id === message?.contact_id);
    if (!message || !contact || contact.is_anonymized) continue;
    const text = textoDaMensagem(message);
    const hash = createHash("sha256").update(text).digest("hex");
    if (!text || (row.source_hash && hash !== row.source_hash)) continue;
    items.push({ id: row.id, conversation_id: row.conversation_id, message_id: row.message_id,
      category: row.category, confidence: row.confidence, excerpt: text.slice(row.excerpt_start, row.excerpt_start + row.excerpt_length),
      contact_name: contact.name ?? "Contato", created_at: row.created_at,
      pause_status: row.pause_status, notify_status: row.notify_status, error_code: row.error_code });
  }
  return ok({ config: config ?? { enabled: false, auto_pause: false, notify_sexta: false },
    canManage: ["admin", "manager"].includes(auth.org.role), items } satisfies RadarData, { requestId });
}

export async function PATCH(req: Request) {
  const denied = await requireSupportWrite();
  if (denied) return denied;
  const requestId = randomUUID();
  const parsed = mutationSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("validation_failed", "Alteração inválida.", 422, { requestId });
  const configChange = "config" in parsed.data;
  const auth = await requireRole(configChange ? "manager" : "agent", { requestId, resource: "radar_comercial" });
  if (!auth.ok) return auth.response;
  const db = await createClient();
  const org = auth.org.orgId;
  const input = parsed.data;
  if ("config" in input) {
    const { data: old, error: readError } = await db.from("radar_config").select("enabled,auto_pause,notify_sexta,enabled_since")
      .eq("organization_id", org).maybeSingle();
    if (readError) return fail("internal_error", "Não foi possível ler a configuração.", 500, { requestId });
    const values = { enabled: false, auto_pause: false, notify_sexta: false, ...old, ...input.config };
    const now = new Date().toISOString();
    const { error } = await db.from("radar_config").upsert({ ...values, organization_id: org, updated_at: now,
      enabled_since: values.enabled && !old?.enabled ? now : old?.enabled_since ?? now });
    if (error) return fail("internal_error", "Não foi possível salvar a configuração.", 500, { requestId });
    await audit({ action: "radar.config_updated", organizationId: org, actorUserId: auth.user.id,
      resourceType: "radar_config", resourceId: org, requestId, metadata: input.config });
  } else {
    const { data, error } = await db.from("radar_analises").update({ resolved_at: new Date().toISOString() })
      .eq("organization_id", org).eq("id", input.resolve).select("id");
    if (error) return fail("internal_error", "Não foi possível resolver o alerta.", 500, { requestId });
    if (!data?.length) return fail("not_found", "Alerta não encontrado.", 404, { requestId });
    await audit({ action: "radar.signal_resolved", organizationId: org, actorUserId: auth.user.id,
      resourceType: "radar_analises", resourceId: input.resolve, requestId });
  }
  return ok({ saved: true }, { requestId });
}
