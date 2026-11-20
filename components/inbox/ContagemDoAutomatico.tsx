"use client";
import { useEffect, useState } from "react";
import { Timer } from "lucide-react";

/** "3:42", "0:08" ou, passando de uma hora, "1:02:30". Pura, para o teste não depender de relógio. */
export function formatarFaltam(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/**
 * Contador regressivo até o automático voltar (silêncio curto de resposta humana).
 * Conta a cada segundo no navegador; ao zerar mostra `quandoZerar`.
 * Algarismos de largura fixa (a etiqueta não "dança" a cada segundo) e um relógio
 * pequeno na frente, para ler de relance que é uma contagem.
 */
export function ContagemDoAutomatico({
  ate, prefixo, quandoZerar,
}: { ate: Date; prefixo: string; quandoZerar: string }) {
  const alvo = ate.getTime();
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const falta = alvo - agora;
  const zerou = falta <= 0;
  return (
    <span data-testid="contagem-do-automatico" className="inline-flex items-center gap-1">
      <Timer className={`size-2.5 shrink-0 ${zerou ? "" : "animate-pulse"}`} aria-hidden="true" />
      <span className="tabular-nums">{zerou ? quandoZerar : `${prefixo} ${formatarFaltam(falta)}`}</span>
    </span>
  );
}
