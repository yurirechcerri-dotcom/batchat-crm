"use client";
import { useEffect, useState } from "react";

/**
 * `true` só depois de a tela ter pintado e o navegador ter ficado ocioso (ou de `limiteMs` passar).
 *
 * Existe para chamadas de apoio (versão do sistema, sons, selos) que não decidem o que a pessoa vê
 * no primeiro quadro. No celular, cada requisição disputa banda e servidor com o que importa — a
 * lista e o cabeçalho —, e a tela demorava mais para ficar pronta. Adiar essas chamadas libera
 * a largada para o essencial.
 */
export function useQuandoOcioso(limiteMs = 2500): boolean {
  const [pronto, setPronto] = useState(false);
  useEffect(() => {
    const ric = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const cic = (globalThis as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback;
    if (ric) {
      const id = ric(() => setPronto(true), { timeout: limiteMs });
      return () => cic?.(id);
    }
    const t = setTimeout(() => setPronto(true), Math.min(limiteMs, 1200));
    return () => clearTimeout(t);
  }, [limiteMs]);
  return pronto;
}
