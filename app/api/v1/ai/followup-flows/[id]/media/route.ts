import { createHash, randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ok, fail } from "@/lib/api/wrappers";
import { lerCorpoComTeto } from "@/lib/api/corpo-com-teto";
import { audit } from "@/lib/audit";
import { FLOW_MEDIA_BUCKET } from "@/lib/followup/midia-privada";
import { assinaturaDaMidiaConfere, validarMidiaUpload, TIPOS_MIDIA_FLUXO, MAX_MESSAGE_MEDIA_BYTES } from "@/lib/followup/validar-midia-upload";
import { transcodificarNotaDeVoz } from "@/lib/messaging/media/voice-transcode";

export const dynamic = "force-dynamic";

/** Guarda o arquivo, não salva/publica o grafo nem envia mensagem. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requireSupportWrite();
  if (denied) return denied;
  const requestId = randomUUID();
  const parsed = z.object({ id: z.uuid() }).safeParse(await ctx.params);
  if (!parsed.success) return fail("invalid_request", "Fluxo inválido.", 400, { requestId });
  const auth = await requireRole("manager", { requestId, resource: "followup_flows" });
  if (!auth.ok) return auth.response;
  const organizationId = auth.org.orgId;
  const db = await createClient();
  const { data: flow, error } = await db.from("followup_flow_pointers").select("id")
    .eq("id", parsed.data.id).eq("organization_id", organizationId).maybeSingle();
  if (error) return fail("internal_error", "Não foi possível conferir o fluxo.", 500, { requestId });
  if (!flow) return fail("not_found", "Fluxo não encontrado.", 404, { requestId });
  const body = await lerCorpoComTeto(req, MAX_MESSAGE_MEDIA_BYTES + 1_048_576, { requestId });
  if (!body.ok) return body.response;
  const form = await body.corpo.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return fail("validation_failed", "Selecione um arquivo.", 422, { requestId });
  let mime = file.type.split(";")[0]!.trim().toLowerCase();
  const invalid = validarMidiaUpload(mime, file.size);
  if (invalid) return fail(file.size > MAX_MESSAGE_MEDIA_BYTES ? "payload_too_large" : "validation_failed", invalid, file.size > MAX_MESSAGE_MEDIA_BYTES ? 413 : 422, { requestId });
  let bytes = Buffer.from(await file.arrayBuffer());
  let ext = TIPOS_MIDIA_FLUXO[mime]!;
  if (!assinaturaDaMidiaConfere(bytes, ext)) return fail("validation_failed", "O conteúdo não corresponde ao tipo do arquivo.", 422, { requestId });
  // WebM de áudio não sai intacto pelo canal oficial. Não transformar vídeo em áudio.
  if (mime === "audio/webm") {
    const converted = await transcodificarNotaDeVoz({ buffer: bytes, mime });
    if (!converted.convertido) return fail("validation_failed", "Não foi possível preparar esse áudio. Envie MP3 ou OGG.", 422, { requestId });
    bytes = Buffer.from(converted.buffer);
    mime = converted.mime;
    ext = "ogg";
  }
  const finalInvalid = validarMidiaUpload(mime, bytes.length);
  if (finalInvalid) return fail("payload_too_large", finalInvalid, 413, { requestId });
  const admin = createAdminClient();
  // Provisionamento idempotente: funciona também em instalação nova.
  let bucket = await admin.storage.getBucket(FLOW_MEDIA_BUCKET);
  if (!bucket.data) {
    await admin.storage.createBucket(FLOW_MEDIA_BUCKET, { public: false, fileSizeLimit: 30_000_000 });
    bucket = await admin.storage.getBucket(FLOW_MEDIA_BUCKET);
  }
  if (bucket.error || !bucket.data || bucket.data.public) return fail("internal_error", "Armazenamento privado indisponível. Tente novamente.", 503, { requestId });
  const hash = createHash("sha256").update(bytes).digest("hex");
  const path = `${organizationId}/${hash}.${ext}`;
  const { error: uploadError } = await admin.storage.from(FLOW_MEDIA_BUCKET)
    .upload(path, bytes, { contentType: mime, upsert: true });
  if (uploadError) return fail("internal_error", "Não foi possível subir o arquivo. Tente novamente.", 500, { requestId });
  void audit({ action: "followup_flow.media_uploaded", actorUserId: auth.user.id,
    organizationId, resourceType: "followup_flow_pointer", resourceId: flow.id,
    requestId, metadata: { media_size_bytes: bytes.length, media_mime: mime } });
  return ok({ media_url: `storage://${FLOW_MEDIA_BUCKET}/${path}`, media_mime: mime,
    media_size_bytes: bytes.length }, { requestId });
}
