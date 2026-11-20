import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { consultarHistoricoDisponivel } from "@/lib/channels/historico/disponivel";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 90;
const diasSchema = z.coerce.number().pipe(z.union([z.literal(30), z.literal(90), z.literal(180), z.literal(365)]));

/** Consulta agregada somente leitura, separada das transições do importador. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const requestId = randomUUID();
  const opts = { requestId, headers: { "Cache-Control": "private, no-store" } };
  const auth = await requireRole("admin", { requestId, resource: "channel_sessions", allowPlatformAdmin: "leitura" });
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const dias = diasSchema.safeParse(req.nextUrl.searchParams.get("dias") ?? "30");
  if (!z.uuid().safeParse(id).success || !dias.success) {
    return fail("validation_failed", "Canal ou período inválido.", 422, opts);
  }
  try {
    const previa = await consultarHistoricoDisponivel(createAdminClient(), {
      organizationId: auth.org.orgId, channelSessionId: id, dias: dias.data,
      signal: req.signal,
    });
    return ok({ previa }, opts);
  } catch (err) {
    const codigo = err instanceof Error ? err.message : "";
    if (codigo === "historico_canal_nao_encontrado") return fail("not_found", "Canal não encontrado.", 404, opts);
    if (codigo === "historico_canal_nao_suportado") return fail("state_conflict", "Esta conexão ainda não oferece esta consulta.", 409, opts);
    if (codigo === "historico_credencial_indisponivel") return fail("state_conflict", "Confira a credencial desta conexão.", 409, opts);
    // Não devolver/logar payloads, participantes, chaves ou mensagens do provedor.
    return fail("channel_unavailable", "Não foi possível consultar o histórico. Confira a conexão e tente novamente.", 502, opts);
  }
}
