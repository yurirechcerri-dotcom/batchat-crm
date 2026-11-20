/** Contrato explícito de entrada das perguntas importadas. Não interpreta aceite. */
export type FormatoDeEntrada = "text" | "first_name";
export function respostaImportada(body: string, formato: FormatoDeEntrada): string | null {
  const value = body.trim();
  if (!value || [...value].length > 2048) return null;
  if (formato === "text") return value;
  const first = value.split(/\s+/u)[0];
  return first && /^[\p{L}][\p{L}'’\-]{0,79}$/u.test(first) ? first : null;
}
