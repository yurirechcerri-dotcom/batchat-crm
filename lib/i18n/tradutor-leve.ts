import { IDIOMA_PADRAO, type Idioma } from "./idiomas";

/**
 * Tradutor que NÃO importa o dicionário (~450 KB). Quem precisa traduzir em
 * código que o navegador também executa usa `traduzirLeve`; o dicionário é
 * registrado aqui por quem o carrega: o provider de idioma (navegador, só fora
 * do português), o `instrumentation.ts` (servidor) e o worker.
 */
export type Tradutor = (texto: string, idioma: Idioma) => string;

const CHAVE_DO_TRADUTOR = "__bcTradutor";

export function lerTradutorCarregado(): Tradutor | null {
  return ((globalThis as Record<string, unknown>)[CHAVE_DO_TRADUTOR] as Tradutor | null) ?? null;
}

export function registrarTradutor(fn: Tradutor): void {
  (globalThis as Record<string, unknown>)[CHAVE_DO_TRADUTOR] = fn;
}

/** Português devolve o texto na hora; outro idioma usa o dicionário registrado e, sem ele, o texto original. */
export function traduzirLeve(texto: string, idioma: Idioma): string {
  if (idioma === IDIOMA_PADRAO) return texto;
  return lerTradutorCarregado()?.(texto, idioma) ?? texto;
}

/** Para processos de servidor (app e worker): carrega o dicionário uma vez, no início. */
export async function registrarDicionarioNoServidor(): Promise<void> {
  if (lerTradutorCarregado()) return;
  const m = await import("./dicionario");
  registrarTradutor(m.traduzir);
}
