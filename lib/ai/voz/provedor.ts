/** A escolha de TTS da organização. Ausência preserva instalações ElevenLabs. */
export const PROVEDORES_DE_VOZ = ["elevenlabs", "fish"] as const;
export type ProvedorDeVoz = (typeof PROVEDORES_DE_VOZ)[number];

export function provedorDeVoz(value: unknown): ProvedorDeVoz {
  if (value === undefined || value === null) return "elevenlabs";
  if (value === "elevenlabs" || value === "fish") return value;
  throw new Error("voice_provider_unknown");
}

export function modeloPadraoDaVoz(provider: ProvedorDeVoz): string {
  return provider === "fish" ? "s2.1-pro" : "eleven_multilingual_v2";
}

/** Fish V1 usa o modelo provado na operação; não aceita tarifa desconhecida. */
export function modeloDeVozValido(provider: ProvedorDeVoz, model: string): boolean {
  return provider === "fish"
    ? model === "s2.1-pro"
    : model.startsWith("eleven_") && model.length <= 200;
}

/** Estimativa em centavos USD; Fish mede bytes UTF-8, não JS string.length.
 * Fonte (2026-11-14): https://docs.fish.audio/developer-guide/models-pricing/pricing-and-rate-limits
 * S2.1 Pro: USD 15 / milhão de bytes. Não representa fatura do provedor.
 */
export function custoFishCents(bytesDeTexto: number, model: string): number {
  if (!modeloDeVozValido("fish", model) || !Number.isFinite(bytesDeTexto) || bytesDeTexto < 0) {
    throw new Error("voice_usage_invalid");
  }
  return (bytesDeTexto * 1500) / 1_000_000;
}
