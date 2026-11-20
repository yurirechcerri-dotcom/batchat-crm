import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { socialRequest } from "../social/client";
import { zernioCredsForAccountId } from "../zernio/credentials";
import type { EscopoHistoricoZernio } from "./zernio-leitura";

const plataformaSchema = z.enum(["whatsapp", "instagram", "facebook"]);
const sessaoSchema = z.object({
  provider: z.string(),
  zernio_account_id: z.string().min(1),
  zernio_profile_id: z.string().min(1).nullish(),
  metadata: z.object({ social_platform: z.string().optional() }).nullish(),
});
const contasSchema = z.object({ accounts: z.array(z.object({
  _id: z.string().min(1), platform: z.string(), isActive: z.boolean(),
  profileId: z.union([z.string().min(1), z.object({ _id: z.string().min(1) })]),
})) });

/** A tela só escolhe a sessão. Conta, plataforma, perfil e chave vêm de vínculos conferidos. */
export async function resolverEscopoDoHistorico(
  db: SupabaseClient,
  organizationId: string,
  channelSessionId: string,
  signal?: AbortSignal,
): Promise<EscopoHistoricoZernio & { chave: string }> {
  if (!organizationId || !channelSessionId) throw new Error("historico_canal_nao_encontrado");
  signal?.throwIfAborted();
  let consulta = db.from("channel_sessions")
    .select("provider, zernio_account_id, zernio_profile_id, metadata")
    .eq("organization_id", organizationId).eq("id", channelSessionId)
    .is("archived_at", null);
  if (signal) consulta = consulta.abortSignal(signal);
  const { data, error } = await consulta.maybeSingle();
  signal?.throwIfAborted();
  if (error) throw new Error("historico_sessao_indisponivel");
  if (!data) throw new Error("historico_canal_nao_encontrado");
  const parsed = sessaoSchema.safeParse(data);
  if (!parsed.success) throw new Error("historico_canal_nao_suportado");
  const sessao = parsed.data;
  if (sessao.provider !== "zernio" && sessao.provider !== "zernio_social") {
    throw new Error("historico_canal_nao_suportado");
  }
  const plataforma = plataformaSchema.safeParse(sessao.provider === "zernio" ? "whatsapp" : sessao.metadata?.social_platform);
  if (!plataforma.success) throw new Error("historico_canal_nao_suportado");
  const credencial = await zernioCredsForAccountId(db, { organizationId, accountId: sessao.zernio_account_id, ...(signal ? { signal } : {}) });
  signal?.throwIfAborted();
  if (!credencial) throw new Error("historico_credencial_indisponivel");
  if (credencial.accountId !== sessao.zernio_account_id || credencial.source === "env") {
    throw new Error("historico_escopo_divergente");
  }
  // Conexões por chave própria não guardam perfil. O endpoint de detalhe não
  // aceita GET: resolver na lista de contas, exigindo UMA ocorrência exata.
  const path = sessao.zernio_profile_id
    ? `accounts?profileId=${encodeURIComponent(sessao.zernio_profile_id)}` : "accounts";
  const resposta = contasSchema.safeParse(await socialRequest(credencial.apiKey, path, undefined, "GET", signal));
  signal?.throwIfAborted();
  if (!resposta.success) throw new Error("historico_resposta_invalida");
  const contas = resposta.data.accounts.filter((c) => c._id === sessao.zernio_account_id);
  const [conta] = contas;
  if (contas.length !== 1 || !conta?.isActive) throw new Error("historico_conta_indisponivel");
  const perfilId = typeof conta.profileId === "string" ? conta.profileId : conta.profileId._id;
  if (conta.platform !== plataforma.data || (sessao.zernio_profile_id && sessao.zernio_profile_id !== perfilId)) {
    throw new Error("historico_escopo_divergente");
  }
  return { contaId: conta._id, perfilId, plataforma: plataforma.data, chave: credencial.apiKey };
}
