"use client";

import { usePathname } from "next/navigation";
import { useT } from "@/hooks/i18n/useT";

import { Check } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

export interface PassoVisivel {
  segmento: string;
  rotulo: string;
  cumprido: boolean;
}

/**
 * O indicador de progresso, na lateral, em linha vertical com marca de feito
 * (o desenho do setup do Utmify). No celular vira uma fileira curta no topo.
 *
 * Os passos chegam de `lib/onboarding/passos.ts` — a mesma fonte que decide a
 * ordem e o resumo final. "Concluído" vem do estado gravado, não da posição; o
 * passo ATUAL sai da rota.
 */
export function Stepper({ passos }: { passos: PassoVisivel[] }) {
  const t = useT();
  const pathname = usePathname() ?? "";
  const idx = passos.findIndex((p) => pathname.includes(`/${p.segmento}`));

  return (
    <ol aria-label="onboarding steps" className="flex items-start gap-3 lg:flex-col lg:gap-0">
      {passos.map((p, i) => {
        const ativo = i === idx;
        const ultimo = i === passos.length - 1;
        return (
          <li
            key={p.segmento}
            aria-current={ativo ? "step" : undefined}
            className="relative flex flex-1 items-center gap-3 lg:w-full lg:flex-none lg:pb-8"
          >
            {/* A linha que liga um passo ao próximo (só na lateral). */}
            {!ultimo ? (
              <span
                aria-hidden
                className={cn(
                  "absolute left-[15px] top-8 hidden h-[calc(100%-2rem)] w-0.5 lg:block",
                  p.cumprido ? "bg-primary" : "bg-border",
                )}
              />
            ) : null}
            <span
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold",
                p.cumprido && "border-primary bg-primary text-primary-foreground",
                !p.cumprido && ativo && "border-primary text-primary",
                !p.cumprido && !ativo && "border-border text-muted-foreground",
              )}
            >
              {p.cumprido ? <Check weight="bold" className="h-4 w-4" aria-hidden /> : i + 1}
            </span>
            {/* Em telas estreitas o rótulo sai (sr-only): a tela já tem título. */}
            <span
              className={cn(
                "sr-only text-sm lg:not-sr-only",
                ativo ? "font-semibold text-foreground" : "text-muted-foreground",
                p.cumprido && !ativo && "line-through decoration-muted-foreground/40",
              )}
            >
              {t(p.rotulo)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
