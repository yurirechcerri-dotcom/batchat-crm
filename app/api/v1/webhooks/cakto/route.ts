/**
 * POST /api/v1/webhooks/cakto — avisos de venda da Cakto viram etiquetas no contato (V1, 15/11/2026).
 *
 * Guardas, nesta ordem: instalação configurada (`CAKTO_WEBHOOK_SECRET` + `CAKTO_ORGANIZATION_ID`, senão 503) →
 * corpo ≤ 256 KB (413) → prova de origem pela assinatura/secret (401) → só então o corpo é interpretado.
 * O único efeito é gravar etiquetas no contato (achado por telefone ou e-mail; criado se não existe). Etiqueta é
 * conjunto: reenviar o mesmo aviso não muda nada (idempotente por construção). Evento desconhecido → 200, nada muda.
 * Não cria negócio, não cobra e não envia mensagem.
 */
import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { compradorDoEvento, etiquetasDoEvento, origemValida, unirEtiquetas } from "@/lib/cakto/webhook";
import { normalizePhoneBR } from "@/lib/channels/phone-variants";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const LIMITE_DO_CORPO = 256 * 1024;

export async function POST(req: NextRequest) {
  const requestId = randomUUID();
  const segredo = process.env.CAKTO_WEBHOOK_SECRET ?? "";
  const organizationId = process.env.CAKTO_ORGANIZATION_ID ?? "";
  if (!segredo || !organizationId) return fail("not_configured", "Cakto não configurada", 503, { requestId });

  const corpoCru = await req.text();
  if (corpoCru.length > LIMITE_DO_CORPO) return fail("payload_too_large", "Corpo grande demais", 413, { requestId });

  let corpo: { secret?: unknown; event?: unknown; data?: unknown };
  try {
    corpo = JSON.parse(corpoCru);
  } catch {
    corpo = {};
  }
  const autorizado = origemValida({
    corpoCru,
    timestamp: req.headers.get("x-cakto-timestamp"),
    assinatura: req.headers.get("x-cakto-signature"),
    secretDoCorpo: corpo.secret,
    segredo,
  });
  if (!autorizado) return fail("unauthorized", "Origem não confirmada", 401, { requestId });

  const etiquetas = etiquetasDoEvento(corpo.event, corpo.data);
  if (etiquetas.length === 0) return ok({ ignorado: true }, { requestId });

  const comprador = compradorDoEvento(corpo.data);
  const telefone = normalizePhoneBR(comprador.telefone);
  if (!telefone && !comprador.email) return ok({ ignorado: true, motivo: "sem_contato" }, { requestId });

  const admin = createAdminClient();
  let contato: { id: string; tags: string[] | null } | null = null;
  if (telefone) {
    const { data } = await admin.from("contacts").select("id, tags").eq("organization_id", organizationId).eq("phone_number", telefone).limit(1).maybeSingle();
    contato = data;
  }
  if (!contato && comprador.email) {
    const { data } = await admin.from("contacts").select("id, tags").eq("organization_id", organizationId).ilike("email", comprador.email).limit(1).maybeSingle();
    contato = data;
  }

  if (!contato) {
    const { data, error } = await admin
      .from("contacts")
      .insert({ organization_id: organizationId, name: comprador.nome, phone_number: telefone, email: comprador.email, tags: unirEtiquetas([], etiquetas), source_metadata: { origem: "cakto" } })
      .select("id")
      .single();
    if (error) {
      logger.error("cakto: falha ao criar contato", { requestId, err: error.message });
      return fail("internal_error", "Falha ao gravar", 500, { requestId });
    }
    logger.info("cakto: contato criado", { requestId, evento: corpo.event });
    return ok({ contato: data.id, criado: true }, { requestId });
  }

  const novas = unirEtiquetas(contato.tags ?? [], etiquetas);
  if (novas.length !== (contato.tags ?? []).length) {
    const { error } = await admin.from("contacts").update({ tags: novas }).eq("organization_id", organizationId).eq("id", contato.id);
    if (error) {
      logger.error("cakto: falha ao gravar etiqueta", { requestId, err: error.message });
      return fail("internal_error", "Falha ao gravar", 500, { requestId });
    }
    logger.info("cakto: etiqueta gravada", { requestId, evento: corpo.event, etiquetas });
  }
  return ok({ contato: contato.id, criado: false }, { requestId });
}
