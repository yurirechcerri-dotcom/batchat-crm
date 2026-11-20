import { FUSO_PADRAO, fusoValido } from "@/lib/tempo/fusos";

export function horarioValido(valor: unknown): valor is string {
  return typeof valor === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(valor);
}

/** Relógio injetado: a decisão usa o fuso da organização, nunca o da VPS. */
export function avaliarHorarioLocal(
  op: string, valor: unknown, agora: Date, fuso?: string | null,
): boolean {
  if (!horarioValido(valor) || !Number.isFinite(agora.getTime())) return false;
  const partes = new Intl.DateTimeFormat("en-GB", {
    timeZone: fuso && fusoValido(fuso) ? fuso : FUSO_PADRAO,
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(agora);
  const atual = `${partes.find((p) => p.type === "hour")?.value}:${partes.find((p) => p.type === "minute")?.value}`;
  if (!horarioValido(atual)) return false;
  switch (op) {
    case "eq": return atual === valor;
    case "neq": return atual !== valor;
    case "gte": return atual >= valor;
    case "lte": return atual <= valor;
    default: return false;
  }
}
