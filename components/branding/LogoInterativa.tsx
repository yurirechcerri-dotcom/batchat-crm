"use client";

import { useRef, type PointerEvent } from "react";
import { BatMarca } from "@/components/branding/BatSceneria";

/**
 * A logo do BatChat que acompanha o mouse: inclina em 3D conforme o ponteiro se move
 * sobre a área (efeito da página inicial antiga). Sem ponteiro fino (celular) ou com
 * "reduzir movimento" ligado, fica parada. Só transform: nada de layout.
 */
export function LogoInterativa({ className, grau = 14 }: { className?: string; grau?: number }) {
  const ref = useRef<HTMLDivElement | null>(null);

  const mover = (e: PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el || e.pointerType === "touch" || e.pointerType === "pen") return;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    const y = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const cx = Math.max(-1, Math.min(1, x));
    const cy = Math.max(-1, Math.min(1, y));
    el.style.transform = `perspective(700px) rotateY(${(cx * grau).toFixed(2)}deg) rotateX(${(-cy * grau).toFixed(2)}deg)`;
  };
  const soltar = () => {
    if (ref.current) ref.current.style.transform = "perspective(700px) rotateY(0deg) rotateX(0deg)";
  };

  return (
    <div className="inline-block p-6" onPointerMove={mover} onPointerLeave={soltar} data-testid="logo-interativa">
      <div ref={ref} className={`transition-transform duration-150 ease-out will-change-transform ${className ?? ""}`}>
        <BatMarca className="h-28 w-40 text-accent drop-shadow-[0_0_28px_var(--color-accent)]" />
      </div>
    </div>
  );
}
