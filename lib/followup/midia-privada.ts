import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

export const FLOW_MEDIA_BUCKET = "followup-media";

const PADRAO_DO_CAMINHO = /^[a-f0-9-]{36}\/[a-f0-9]{64}\.(png|jpg|jpeg|webp|gif|mp3|ogg|opus|wav|m4a|mp4|webm|pdf)$/;
const PREFIXO_ASSINADO = `/storage/v1/object/sign/${FLOW_MEDIA_BUCKET}/`;

/**
 * Mídia que um fluxo já enviou fica na mensagem como a URL assinada da hora do envio (vale 1 h).
 * Depois disso a Inbox mostrava "Mídia indisponível". O caminho durável está dentro dessa URL:
 * devolve-o (só do bucket do fluxo e da própria organização) para a rota assinar de novo.
 */
export function caminhoDaMidiaDoFluxo(
  mediaUrl: string | null | undefined,
  organizationId: string,
): string | null {
  if (!mediaUrl) return null;
  let url: URL;
  try {
    url = new URL(mediaUrl);
  } catch {
    return null;
  }
  if (!url.pathname.startsWith(PREFIXO_ASSINADO)) return null;
  const path = decodeURIComponent(url.pathname.slice(PREFIXO_ASSINADO.length));
  if (!PADRAO_DO_CAMINHO.test(path) || path.split("/")[0] !== organizationId) return null;
  return path;
}

/** O grafo guarda uma referência durável; a URL de entrega vence em uma hora. */
export async function resolverMidiaDoFluxo(
  organizationId: string, reference: string | undefined | null,
  getAdmin: () => SupabaseClient = createAdminClient,
): Promise<string | undefined> {
  if (!reference) return undefined;
  const url = new URL(reference);
  if (url.protocol !== "storage:") return reference;
  const path = url.pathname.slice(1);
  if (url.hostname !== FLOW_MEDIA_BUCKET || url.search || url.hash ||
      !/^[a-f0-9-]{36}\/[a-f0-9]{64}\.(png|jpg|jpeg|webp|gif|mp3|ogg|opus|wav|m4a|mp4|webm|pdf)$/.test(path) ||
      path.split("/")[0] !== organizationId) throw new Error("flow_media_outside_organization");
  const { data, error } = await getAdmin().storage.from(FLOW_MEDIA_BUCKET).createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) throw new Error("flow_media_sign_failed");
  return data.signedUrl;
}
