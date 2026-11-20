"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { concluirTour } from "@/app/actions/onboarding/concluirTour";
import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";

/**
 * O MINI TOUR — cinco paradas pela casca do app, logo depois de criar a conta,
 * ANTES do setup. Cada parada acende um item do menu (quando ele está visível)
 * e diz numa frase para que serve. Sem item visível (celular, menu recolhido
 * em grupo), a explicação vira um cartão no centro.
 *
 * Termina — ou é pulado — carimbando `onboarding_state.tour` (ação
 * `concluirTour`) e leva ao setup em `/onboarding`.
 */
const PARADAS: { alvo: string | null; titulo: string; texto: string }[] = [
  {
    alvo: "/app/inbox",
    titulo: "Inbox",
    texto: "Todas as conversas do WhatsApp e do Instagram num lugar só, com a IA e a equipe respondendo.",
  },
  {
    alvo: "/app/contacts",
    titulo: "Contatos",
    texto: "Quem já falou com você, com etiquetas e histórico. É daqui que saem os seus leads.",
  },
  {
    alvo: "/app/ai/followups",
    titulo: "Fluxos",
    texto: "Automações que respondem uma palavra-chave, entregam seu material e acompanham quem sumiu.",
  },
  {
    alvo: "/app/connections",
    titulo: "Conexões",
    texto: "Onde você liga o seu WhatsApp e o seu Instagram ao BatChat.",
  },
  {
    alvo: null,
    titulo: "Agora, a configuração",
    texto: "São poucos passos, e você pode pular qualquer um. Vamos?",
  },
];

interface Retangulo {
  top: number;
  left: number;
  width: number;
  height: number;
}

function medirAlvo(href: string | null): Retangulo | null {
  if (!href) return null;
  // O primeiro link visível do menu: o mesmo item existe na barra lateral e,
  // no celular, na gaveta — só o que ocupa espaço na tela serve de alvo.
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(`a[href="${href}"]`))) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return { top: r.top, left: r.left, width: r.width, height: r.height };
  }
  return null;
}

export function TourDoApp() {
  const t = useT();
  const router = useRouter();
  const [indice, setIndice] = useState(0);
  const [alvo, setAlvo] = useState<Retangulo | null>(null);
  const [pending, startTransition] = useTransition();
  const proximoRef = useRef<HTMLButtonElement>(null);

  const parada = PARADAS[indice]!;
  const ultima = indice === PARADAS.length - 1;

  useLayoutEffect(() => {
    const medir = () => setAlvo(medirAlvo(parada.alvo));
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, [parada.alvo]);

  useEffect(() => {
    proximoRef.current?.focus();
  }, [indice]);

  const sair = useCallback(
    (pulou: boolean) => {
      startTransition(async () => {
        await concluirTour({ pulou });
        // O layout de `/app` agora vê o tour carimbado e manda para o setup.
        router.replace("/onboarding");
        router.refresh();
      });
    },
    [router],
  );

  const avancar = useCallback(() => {
    if (ultima) sair(false);
    else setIndice((i) => i + 1);
  }, [ultima, sair]);

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") sair(true);
      if (e.key === "ArrowRight") avancar();
      if (e.key === "ArrowLeft") setIndice((i) => Math.max(0, i - 1));
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [avancar, sair]);

  const MARGEM = 6;
  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-labelledby="tour-titulo">
      {/* Sem alvo, um véu simples; com alvo, o "buraco" sobre o item do menu. */}
      {alvo ? (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-lg ring-2 ring-primary"
          style={{
            top: alvo.top - MARGEM,
            left: alvo.left - MARGEM,
            width: alvo.width + MARGEM * 2,
            height: alvo.height + MARGEM * 2,
            boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.6)",
          }}
        />
      ) : (
        <div aria-hidden className="absolute inset-0 bg-black/60" />
      )}

      <div
        className="absolute w-[min(22rem,calc(100vw-2rem))] rounded-xl border bg-card p-5 shadow-xl"
        style={
          alvo
            ? {
                top: Math.min(Math.max(alvo.top - 8, 16), window.innerHeight - 240),
                left: alvo.left + alvo.width + 20,
              }
            : { top: "50%", left: "50%", transform: "translate(-50%, -50%)" }
        }
      >
        <p className="text-xs text-muted-foreground">
          {indice + 1} / {PARADAS.length}
        </p>
        <h2 id="tour-titulo" className="mt-1 text-lg font-semibold tracking-tight">
          {t(parada.titulo)}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">{t(parada.texto)}</p>
        <div className="mt-5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => sair(true)}
            disabled={pending}
            className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            {t("Pular tour")}
          </button>
          <Button ref={proximoRef} onClick={avancar} disabled={pending}>
            {ultima ? t("Começar a configuração") : t("Próximo")}
          </Button>
        </div>
      </div>
    </div>
  );
}
