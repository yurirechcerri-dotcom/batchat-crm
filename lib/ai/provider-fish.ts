import type { ValidationResult } from "./provider-validators";

/**
 * A carteira exige BearerAuth; a biblioteca pública de vozes não prova a chave.
 * `self` é o user_id documentado no OpenAPI oficial:
 * https://docs.fish.audio/api-reference/openapi.json
 * Saldo zero continua sendo uma credencial válida. Não sintetiza nem cobra.
 */
export const URL_DE_VALIDACAO_FISH = "https://api.fish.audio/wallet/self/api-credit";

export async function validateFishKey(apiKey: string): Promise<ValidationResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(URL_DE_VALIDACAO_FISH, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: ctrl.signal,
      redirect: "error",
    });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: "auth_failed_401" };
    }
    if (!res.ok) return { ok: false, error: `provider_status_${res.status}` };
    const json: unknown = await res.json();
    if (
      !json || typeof json !== "object" ||
      !("user_id" in json) || typeof json.user_id !== "string" || !json.user_id.trim() ||
      !("credit" in json) || typeof json.credit !== "string"
    ) {
      return { ok: false, error: "provider_response_invalid" };
    }
    // A escolha de voz é separada: uma chave válida pode não possuir clones,
    // mas ter acesso a uma voz pública pelo ID informado pelo operador.
    return { ok: true, models: [] };
  } catch {
    return { ok: false, error: ctrl.signal.aborted ? "AbortError" : "network_error" };
  } finally {
    clearTimeout(timer);
  }
}
