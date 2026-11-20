import type { SupabaseClient } from "@supabase/supabase-js";

export function temMarcaDeHistorico(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return false;
  const marca = (metadata as Record<string, unknown>).historico_importado;
  return marca === "true" || marca === true;
}

/**
 * Antes de qualquer efeito do webhook: histórico não enriquece contato, muda
 * endereço da thread, solicita mídia ou vira demanda nova por ser reentregue.
 * A chave de idempotência do banco é organização + external_id.
 */
export async function mensagemJaImportada(
  db: SupabaseClient,
  organizationId: string,
  externalId: string,
): Promise<boolean> {
  const { data, error } = await db.from("messages")
    .select("metadata")
    .eq("organization_id", organizationId)
    .eq("external_id", externalId)
    .maybeSingle();
  if (error) throw new Error("zernio_historico_leitura_failed");
  return temMarcaDeHistorico(data?.metadata);
}
