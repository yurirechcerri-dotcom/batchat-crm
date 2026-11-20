"use client";
import { useEffect, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useT } from "@/hooks/i18n/useT";
import { CommandPalette } from "@/components/shell/CommandPalette";

/** Morcego pequeno: bate as asas enquanto a barra está em foco/hover. */
function MorcegoDeBusca() {
  return (
    <svg
      viewBox="0 0 32 20"
      aria-hidden
      className="bc-busca-morcego h-5 w-8 shrink-0"
      fill="currentColor"
    >
      <g className="bc-busca-asa-e">
        <path d="M16 6 C13 2 7 1 1 4 C3 6 3 9 5 11 C6 9 8 9 9 11 C10 9 12 9 13 12 C14 10 15 9 16 9 Z" />
      </g>
      <g className="bc-busca-asa-d">
        <path d="M16 6 C19 2 25 1 31 4 C29 6 29 9 27 11 C26 9 24 9 23 11 C22 9 20 9 19 12 C18 10 17 9 16 9 Z" />
      </g>
      <path d="M13.5 6 L14 2.5 L15.5 5 H16.5 L18 2.5 L18.5 6 C19 8 18 13 16 15 C14 13 13 8 13.5 6 Z" />
      <circle className="bc-busca-olho" cx="15" cy="8" r=".9" fill="var(--color-background, #111)" />
      <circle className="bc-busca-olho" cx="17" cy="8" r=".9" fill="var(--color-background, #111)" />
    </svg>
  );
}

const DICAS = [
  "Buscar conversas, contatos, páginas...",
  "Procure um nome, telefone ou @instagram",
  "Voe para qualquer tela do BatChat",
];

export function SearchTrigger() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [dica, setDica] = useState(0);

  // `enableOnFormTags`: o atalho precisa funcionar com o cursor dentro do
  // composer do inbox, que é onde o operador passa o dia.
  useHotkeys("mod+k", () => setOpen(true), { preventDefault: true, enableOnFormTags: true });

  // As frases giram devagar: ensinam o que a busca acha sem ocupar a tela.
  useEffect(() => {
    const id = setInterval(() => setDica((d) => (d + 1) % DICAS.length), 4500);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("Buscar...")}
        className="bc-busca group relative flex h-10 w-full min-w-0 items-center gap-3 overflow-hidden rounded-full border bg-muted/40 px-4 text-left text-sm text-muted-foreground md:w-[28rem] md:max-w-full"
      >
        <span className="bc-busca-brilho" aria-hidden />
        <MorcegoDeBusca />
        <span key={dica} className="bc-busca-dica relative min-w-0 flex-1 truncate max-md:sr-only">
          {t(DICAS[dica] ?? DICAS[0] ?? "")}
        </span>
        <kbd className="relative ml-auto hidden shrink-0 rounded-md border bg-background/60 px-2 py-0.5 text-[11px] font-medium md:inline">
          ⌘K
        </kbd>
      </button>
      <CommandPalette open={open} onOpenChange={setOpen} />
    </>
  );
}
