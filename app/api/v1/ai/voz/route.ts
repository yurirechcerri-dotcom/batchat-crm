import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * GET   /api/v1/ai/voz — a voz da organização (voice_id/model_id + o que há
 *       disponível na credencial do provedor de voz) e PATCH para trocá-la.
 *
 * Fase 7 do plano de voz (docs/superpowers/plans/2026-10-29-voz-elevenlabs.md).
 * `voz_enabled`/`voz_quando` são POR VERSÃO do agente (editados no editor de
 * agente, como `split_messages`) — aqui mora só a escolha de QUAL voz, que é
 * da ORGANIZAÇÃO (um recurso contratado uma vez, não por agente), o mesmo
 * desenho de `organizations.settings.llm`.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { traduzir } from "@/lib/i18n/dicionario";
import { getRequestPool } from "@/lib/agent-engine/db/request-pool";
import { loadEnv } from "@/lib/agent-engine/env";
import { resolveOrgLlmConfig } from "@/lib/agent-engine/edge/llm/credentials";
import { llmEdgeConfigFromEnv } from "@/lib/agent-engine/edge/llm/run-model-call";
import {
  listarVozesDoProvedor,
  montarCatalogoDeVozes,
  type VozDoProvedor,
} from "@/lib/ai/voz/catalogo-do-provedor";
import { PADRAO_VOICE_ID } from "@/lib/ai/voz/voice-id";
import { provedorDeVoz, modeloDeVozValido, type ProvedorDeVoz } from "@/lib/ai/voz/provedor";

export const dynamic = "force-dynamic";

interface VozSettings {
  provider?: string;
  voice_id?: string;
  model_id?: string;
}

export async function GET(req?: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "ai_providers" });
  if (!authz.ok) return authz.response;
  const { org } = authz;

  const admin = createAdminClient();

  const { data: orgRow, error: orgError } = await admin
    .from("organizations")
    .select("settings")
    .eq("id", org.orgId)
    .maybeSingle();
  if (orgError || !orgRow) return fail("internal_error", "Erro ao ler a voz.", 500, { requestId });
  const voz = ((orgRow.settings as { voz?: VozSettings } | null)?.voz ?? {}) as VozSettings;
  let providerSalvo: ProvedorDeVoz;
  let provider: ProvedorDeVoz;
  try {
    providerSalvo = provedorDeVoz(voz.provider);
    provider = provedorDeVoz(req?.nextUrl.searchParams.get("provider") ?? voz.provider);
  } catch {
    return fail("invalid_provider", "Provedor de voz inválido.", 422, { requestId });
  }
  // Mesmo critério do resolvedor: credencial validada mais recente, da sessão.
  // Unir contas distintas aqui oferecia vozes que o executor não poderia usar.
  const { data: credenciais, error: credError } = await admin
    .from("ai_provider_credentials")
    .select("id, label, models_available, validated_at")
    .eq("organization_id", org.orgId)
    .eq("provider", provider)
    .eq("is_active", true)
    .not("validated_at", "is", null)
    .order("created_at", { ascending: false })
    .limit(1);
  if (credError)
    return fail("internal_error", "Erro ao ler a credencial de voz.", 500, { requestId });
  const idsValidados = z.array(z.string()).catch([]).parse(credenciais?.[0]?.models_available);
  const vozesDisponiveis = [...new Set(idsValidados)];
  const temCredencial = (credenciais?.length ?? 0) > 0;
  let catalogo: VozDoProvedor[] = vozesDisponiveis.map((id) => ({ id, nome: id, idioma: null }));
  let catalogoVeioDoProvedor = false;
  if (temCredencial) {
    let chave: string | null = null;
    try {
      const credencial = await resolveOrgLlmConfig(
        getRequestPool(),
        llmEdgeConfigFromEnv(loadEnv()),
        org.orgId,
        { provider },
      );
      chave = credencial.apiKey;
    } catch {
      chave = null;
    }
    if (chave !== null) {
      const chaveParaBuscar = chave;
      const montado = await montarCatalogoDeVozes({
        idsDaCredencial: vozesDisponiveis,
        buscar: () => listarVozesDoProvedor(chaveParaBuscar, fetch, undefined, provider),
      });
      catalogo = montado.catalogo;
      catalogoVeioDoProvedor = montado.veioDoProvedor;
    }
  }

  return ok(
    {
      provider,
      providerSalvo,
      voiceId: provider === providerSalvo ? (voz.voice_id ?? null) : null,
      modelId: provider === providerSalvo ? (voz.model_id ?? null) : null,
      vozesDisponiveis,
      catalogo,
      catalogoVeioDoProvedor,
      temCredencial,
    },
    { requestId },
  );
}

const corpoDoPatch = z.object({
  provider: z.enum(["elevenlabs", "fish"]).optional(),
  // Formato, não catálogo: um id fora da lista é válido (#4260, item 2). A
  // recusa por "não existe" é do provedor, no uso, e chega à tela com a
  // mensagem dele — ver `app/api/v1/ai/voz/preview/route.ts`.
  voice_id: z.string().trim().regex(PADRAO_VOICE_ID),
  model_id: z.string().trim().min(1).max(200).nullable().optional(),
});

export async function PATCH(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "ai_providers" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { user, org } = authz;

  const parsed = corpoDoPatch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("invalid_body", t("corpo inválido"), 422, {
      requestId,
      details: parsed.error.issues,
    });
  }
  const corpo = parsed.data;

  const admin = createAdminClient();

  // MERGE, nunca sobrescrita — mesma razão do PATCH de `settings.llm`
  // (`app/api/v1/ai/providers/route.ts`): `settings` é compartilhado com
  // `branding`/`security`, e um `update({settings:{voz}})` ingênuo os apagaria.
  const { data: orgAtual, error: leituraError } = await admin
    .from("organizations")
    .select("settings")
    .eq("id", org.orgId)
    .maybeSingle();

  if (leituraError || !orgAtual)
    return fail("internal_error", t("Erro ao ler a voz."), 500, { requestId });

  const settingsAtuais = ((orgAtual?.settings ?? {}) as Record<string, unknown>) || {};
  // No mesmo provedor, omissão conserva o modelo; null explícito o limpa.
  // Trocar de provedor também limpa o modelo antigo para não misturar APIs.
  const vozAtual = (settingsAtuais.voz ?? {}) as VozSettings;
  let providerAtual: ProvedorDeVoz;
  try {
    providerAtual = provedorDeVoz(vozAtual.provider);
  } catch {
    return fail("invalid_provider", t("Provedor de voz inválido."), 422, { requestId });
  }
  const provider = corpo.provider ?? providerAtual;
  if (provider === "fish" && !/^[a-f0-9]{32}$/i.test(corpo.voice_id)) {
    return fail(
      "invalid_voice_id",
      t("O Voice ID do Fish Audio deve ter 32 caracteres hexadecimais."),
      422,
      { requestId },
    );
  }
  const modelIdFinal =
    corpo.model_id !== undefined
      ? corpo.model_id
      : provider === providerAtual
        ? (vozAtual.model_id ?? null)
        : null;
  if (modelIdFinal && !modeloDeVozValido(provider, modelIdFinal)) {
    return fail("invalid_model", t("Modelo incompatível com o provedor de voz."), 422, {
      requestId,
    });
  }
  const settings = {
    ...settingsAtuais,
    voz: {
      provider,
      voice_id: corpo.voice_id,
      ...(modelIdFinal ? { model_id: modelIdFinal } : {}),
    },
  };

  // Mesmo motivo do PATCH irmão: RLS de `organizations` só deixa platform
  // admin escrever com o client de sessão — o `.eq("id", org.orgId)` aqui é
  // a única coisa que impede isto de ser um escritor cross-tenant, porque o
  // service role passa por cima da RLS.
  const { data: gravado, error } = await admin
    .from("organizations")
    .update({ settings })
    .eq("id", org.orgId)
    .select("settings")
    .maybeSingle();

  if (error || !gravado) {
    return fail("internal_error", t("Erro ao salvar a voz."), 500, { requestId });
  }

  void audit({
    action: "ai.voz_settings_updated",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "organization",
    resourceId: org.orgId,
    requestId,
    metadata: { provider, voice_id: corpo.voice_id, model_id: modelIdFinal },
  });

  return ok({ provider, voiceId: corpo.voice_id, modelId: modelIdFinal }, { requestId });
}
