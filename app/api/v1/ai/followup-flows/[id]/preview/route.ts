import { resolverMidiaDoFluxo } from "@/lib/followup/midia-privada";
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { ok, fail } from "@/lib/api/wrappers";
import { flowGraphSchema } from "@/lib/followup/graph-schema";

export const dynamic = "force-dynamic";

/** Prévia da versão publicada; nunca lê o rascunho nem executa nós. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const requestId = randomUUID();
  const { id } = await ctx.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return fail("invalid_request", "id inválido.", 400, { requestId });
  }
  const auth = await requireRole("viewer", { requestId, resource: "followup_flows" });
  if (!auth.ok) return auth.response;
  const db = await createClient();
  const { data: pointer, error } = await db.from("followup_flow_pointers")
    .select("id, name, status, active_version_id, surface")
    .eq("organization_id", auth.org.orgId).eq("id", id).maybeSingle();
  if (error) return fail("internal_error", "Não foi possível consultar o fluxo.", 500, { requestId });
  if (!pointer) return fail("not_found", "Fluxo não encontrado.", 404, { requestId });
  if (pointer.status !== "active" || !pointer.active_version_id || pointer.surface === "atendimento") {
    return fail("flow_not_active", "Este fluxo não está disponível para iniciar pela biblioteca.", 409, { requestId });
  }
  const { data: version, error: versionError } = await db.from("followup_flow_versions")
    .select("id, graph").eq("organization_id", auth.org.orgId)
    .eq("pointer_id", id).eq("id", pointer.active_version_id).maybeSingle();
  if (versionError) return fail("internal_error", "Não foi possível consultar a versão publicada.", 500, { requestId });
  const graph = flowGraphSchema.safeParse(version?.graph);
  if (!version || !graph.success) return fail("preview_unavailable", "A prévia publicada está indisponível.", 409, { requestId });
  try {
    await Promise.all(graph.data.nodes.map(async (node) => {
      if (node.type === "action" && node.config.mode === "text" && node.config.media_url) {
        node.config.media_url = await resolverMidiaDoFluxo(auth.org.orgId, node.config.media_url);
      }
    }));
  } catch {
    return fail("preview_unavailable", "Não foi possível carregar as mídias desta organização.", 409, { requestId });
  }
  return ok({ id: pointer.id, name: pointer.name, version_id: version.id, graph: graph.data }, { requestId });
}
