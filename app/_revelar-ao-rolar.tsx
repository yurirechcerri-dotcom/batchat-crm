"use client";

import { useEffect } from "react";

/**
 * Motion da landing (nível II, dentro do Next, sem biblioteca):
 * - blocos `.bc-l-rev` aparecem ao entrar na tela, em escada (atraso por irmão);
 * - a janela do produto desliza levemente com a rolagem (`--bc-l-y`);
 * - a barra em pílula ganha sombra ao sair do topo (`data-rolou`);
 * - cartões acendem um brilho que segue o ponteiro (`--mx`/`--my`), só com mouse.
 * Sem JavaScript (ou com "reduzir movimento") a página já nasce toda visível: o
 * atributo `data-bc-js` só é posto aqui, e é ele que esconde os blocos até a hora.
 */
export function RevelarAoRolar() {
  useEffect(() => {
    const raiz = document.querySelector<HTMLElement>(".bc-landing");
    if (!raiz) return;
    const reduzido = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduzido || typeof IntersectionObserver === "undefined") return;

    raiz.setAttribute("data-bc-js", "");
    const observador = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (e.isIntersecting) {
            e.target.classList.add("bc-l-vis");
            observador.unobserve(e.target);
          }
        }
      },
      { threshold: 0.12 },
    );
    raiz.querySelectorAll<HTMLElement>(".bc-l-rev").forEach((el) => {
      const irmaos = el.parentElement ? Array.from(el.parentElement.children).filter((c) => c.classList.contains("bc-l-rev")) : [];
      el.style.setProperty("--bc-l-d", `${Math.min(Math.max(irmaos.indexOf(el), 0), 6) * 70}ms`);
      observador.observe(el);
    });

    // Seção fora da tela não precisa animar: as animações em laço (brilhos, LEDs,
    // palavras trocando) pausam enquanto a seção não é vista. O visual não muda,
    // e o celular para de desenhar o que ninguém está olhando.
    const vigia = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) e.target.toggleAttribute("data-fora", !e.isIntersecting);
      },
      { rootMargin: "120px 0px" },
    );
    raiz.querySelectorAll<HTMLElement>("main > section").forEach((s) => vigia.observe(s));

    let quadro = 0;
    const aoRolar = () => {
      if (quadro) return;
      quadro = requestAnimationFrame(() => {
        quadro = 0;
        const y = window.scrollY;
        raiz.toggleAttribute("data-rolou", y > 8);
        raiz.style.setProperty("--bc-l-y", String(Math.min(y, 600)));
      });
    };
    aoRolar();
    window.addEventListener("scroll", aoRolar, { passive: true });

    const aoMover = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      raiz.style.setProperty("--px", `${e.clientX}px`);
      raiz.style.setProperty("--py", `${e.clientY}px`);
      const palco = (e.target as Element | null)?.closest<HTMLElement>(".bc-l-palco");
      if (palco) {
        const r = palco.getBoundingClientRect();
        const nx = ((e.clientX - r.left) / r.width - 0.5) * 2;
        const ny = ((e.clientY - r.top) / r.height - 0.5) * 2;
        palco.style.setProperty("--ry", `${(nx * 4).toFixed(2)}deg`);
        palco.style.setProperty("--rx", `${(-ny * 3).toFixed(2)}deg`);
      }
      const cartao = (e.target as Element | null)?.closest<HTMLElement>(".bc-l-card");
      if (!cartao) return;
      const r = cartao.getBoundingClientRect();
      cartao.style.setProperty("--mx", `${e.clientX - r.left}px`);
      cartao.style.setProperty("--my", `${e.clientY - r.top}px`);
    };
    raiz.addEventListener("pointermove", aoMover);
    const soltar = () => {
      const palco = raiz.querySelector<HTMLElement>(".bc-l-palco");
      palco?.style.setProperty("--ry", "0deg");
      palco?.style.setProperty("--rx", "0deg");
    };
    raiz.addEventListener("pointerleave", soltar);

    return () => {
      observador.disconnect();
      vigia.disconnect();
      raiz.querySelectorAll("[data-fora]").forEach((s) => s.removeAttribute("data-fora"));
      window.removeEventListener("scroll", aoRolar);
      raiz.removeEventListener("pointermove", aoMover);
      raiz.removeEventListener("pointerleave", soltar);
      if (quadro) cancelAnimationFrame(quadro);
      raiz.removeAttribute("data-bc-js");
      raiz.removeAttribute("data-rolou");
      raiz.style.removeProperty("--bc-l-y");
    };
  }, []);
  return null;
}
