import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * POST /api/v1/ai/followup-flows/palavra-chave — instala uma automação por
 * palavra-chave: o FLUXO com o texto (rascunho) e a REGRA que escuta a palavra
 * (pausada). Ver `lib/followup/modelos/palavra-chave.ts`.
 *
 * Duas escritas em tabelas diferentes, sem transação entre elas: se a regra
 * falhar, o fluxo recém-criado é apagado, para não sobrar um fluxo órfão que a
 * pessoa nunca pediu. Nada é publicado nem ligado — instalar não manda mensagem
 * para ninguém.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { flowGraphSchema } from "@/lib/followup/graph-schema";
import { validateFlowForPublish } from "@/lib/followup/validate-publish";
import {
  comLink,
  modeloDePalavraPorId,
  montarGrafoDePalavra,
  montarRegraDePalavra,
  separarPalavras,
} from "@/lib/followup/modelos/palavra-chave";
import { traduzir } from "@/lib/i18n/dicionario";
import { createAutomationRuleSchema } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const corpoSchema = z.strictObject({
  model_id: z.string().min(1).max(80),
  /** Uma ou mais palavras, separadas por vírgula. */
  palavras: z.string().min(1).max(300),
  mensagem: z.string().min(1).max(3500).optional(),
  link: z.string().url().max(500).refine((u) => /^https?:\/\//i.test(u), "Use um link http ou https.").optional(),
});

export async function POST(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "automation_rules" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { user, org } = authz;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail("invalid_request", t("Body JSON inválido."), 400, { requestId });
  }
  const parsed = corpoSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("validation_failed", t("Campos inválidos."), 422, { requestId, details: parsed.error.flatten() });
  }

  const modelo = modeloDePalavraPorId(parsed.data.model_id);
  if (!modelo) return fail("not_found", t("Este modelo não existe mais."), 404, { requestId });

  const palavras = separarPalavras(parsed.data.palavras);
  if (palavras.length === 0 || palavras.length > 5 || palavras.some((p) => p.length < 2 || p.length > 40)) {
    return fail(
      "validation_failed",
      t("Escolha de 1 a 5 palavras, cada uma com 2 a 40 letras."),
      422,
      { requestId },
    );
  }
  if (modelo.pedeLink && !parsed.data.link) {
    return fail("validation_failed", t("Cole o link que a pessoa vai receber."), 422, { requestId });
  }

  const mensagem = comLink(parsed.data.mensagem ?? modelo.mensagemPadrao, parsed.data.link);
  const grafo = flowGraphSchema.safeParse(montarGrafoDePalavra(mensagem));
  const publicavel = grafo.success ? validateFlowForPublish(grafo.data) : null;
  if (!grafo.success || (publicavel && !publicavel.ok)) {
    return fail("internal_error", `modelo_invalido: ${modelo.id}`, 500, { requestId });
  }

  const supabase = await createClient();
  const nome = `${modelo.nome} · ${palavras[0]}`;

  const { data: fluxo, error: fluxoErr } = await supabase
    .from("followup_flow_pointers")
    .insert({
      organization_id: org.orgId,
      name: nome,
      draft_graph: grafo.data,
      trigger_config: { kind: "manual" },
      handoff_policy: "pause",
    })
    .select("*")
    .single();
  if (fluxoErr || !fluxo) {
    if (fluxoErr?.code === "23505") {
      return fail(
        "conflict",
        `Você já tem um fluxo chamado «${nome}». Abra esse ou escolha outra palavra.`,
        409,
        { requestId },
      );
    }
    return fail("internal_error", fluxoErr?.message ?? "followup_flow_insert_failed", 500, { requestId });
  }

  const regra = createAutomationRuleSchema.safeParse(
    montarRegraDePalavra({ nome, palavras, flowPointerId: fluxo.id }),
  );
  if (!regra.success) {
    await supabase.from("followup_flow_pointers").delete().eq("id", fluxo.id).eq("organization_id", org.orgId);
    return fail("internal_error", `regra_invalida: ${modelo.id}`, 500, { requestId });
  }

  const { data: criada, error: regraErr } = await supabase
    .from("automation_rules")
    .insert({
      organization_id: org.orgId,
      created_by_user_id: user.id,
      name: regra.data.name,
      trigger_event: regra.data.trigger_event,
      conditions: regra.data.conditions,
      actions: regra.data.actions,
      trigger_config: regra.data.trigger_config ?? {},
    })
    .select("*")
    .single();
  if (regraErr || !criada) {
    // Sem a regra o fluxo não tem quem o arme: não deixar o órfão para trás.
    await supabase.from("followup_flow_pointers").delete().eq("id", fluxo.id).eq("organization_id", org.orgId);
    return fail("internal_error", regraErr?.message ?? "automation_rule_insert_failed", 500, { requestId });
  }

  void audit({
    action: "followup_flow.created",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "followup_flow_pointer",
    resourceId: fluxo.id,
    requestId,
    metadata: { name: nome, model_id: modelo.id, trigger_kind: "manual", rule_id: criada.id },
  });
  void audit({
    action: "automation.rule_created",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "automation_rule",
    resourceId: criada.id,
    requestId,
    metadata: { name: nome, trigger_event: "message.received", model_id: modelo.id },
  });

  return ok({ flow: fluxo, rule: criada }, { requestId, status: 201 });
}
