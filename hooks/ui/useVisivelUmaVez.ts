"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Fica `true` na primeira vez que o elemento chega perto da área visível — e nunca volta a `false`.
 *
 * Serve para adiar trabalho caro de itens fora da tela (a foto de cada linha da lista de conversas
 * disparava uma requisição por contato, todas juntas, no primeiro quadro). Sem
 * `IntersectionObserver` (teste, navegador antigo) o item conta como visível: nada some.
 */
export function useVisivelUmaVez<T extends Element>(margemPx = 240): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [visivel, setVisivel] = useState(() => typeof IntersectionObserver === "undefined");
  useEffect(() => {
    if (visivel) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setVisivel(true);
      return;
    }
    const obs = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((e) => e.isIntersecting)) {
          setVisivel(true);
          obs.disconnect();
        }
      },
      { rootMargin: `${margemPx}px` },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [visivel, margemPx]);
  return [ref, visivel];
}
