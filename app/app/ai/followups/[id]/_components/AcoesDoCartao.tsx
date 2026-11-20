"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useT } from "@/hooks/i18n/useT";
import { Copy, Trash } from "@/lib/ui/icons";

interface Acoes {
  dragging: boolean;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}
const Contexto = createContext<Acoes | null>(null);
export const AcoesDoFluxoProvider = Contexto.Provider;

/** Ações só do rascunho: o canvas conserva desfazer, salvar e publicar. */
export function AcoesDoCartao({ id, label, selected, canDuplicate, children }: {
  id: string; label: string; selected?: boolean; canDuplicate: boolean; children: ReactNode;
}) {
  const acoes = useContext(Contexto);
  const t = useT();
  const [hover, setHover] = useState(false);
  const [focused, setFocused] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const limparHover = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setHover(false);
  };
  if (!acoes) return children;
  const visible = !acoes.dragging && (hover || focused || selected);

  return <div className="relative rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent" data-testid={`node-actions-${id}`}
    onMouseEnter={() => {
      if (timer.current) clearTimeout(timer.current);
      if (!acoes.dragging) timer.current = setTimeout(() => setHover(true), 1000);
    }}
    onMouseLeave={limparHover}
    onPointerDownCapture={(e) => { if (!(e.target as HTMLElement).closest("button")) limparHover(); }}
    onFocusCapture={() => setFocused(true)}
    onBlurCapture={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false); }}
    tabIndex={0} aria-label={label}>
    {visible && <div className="nodrag nopan absolute bottom-full left-1/2 z-30 -translate-x-1/2 pb-2"
      onClick={(e) => e.stopPropagation()}>
      <div role="group" aria-label={t("Ações do nó")} className="flex gap-1 rounded-md border border-border bg-surface p-1 shadow-lg">
        <Button type="button" variant="ghost" size="icon" className="h-11 w-11"
          aria-label={t("Duplicar nó")} title={t("Duplicar nó")}
          disabled={!canDuplicate} onClick={() => acoes.onDuplicate(id)}>
          <Copy size={18} aria-hidden />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-11 w-11 text-error-fg"
          aria-label={t("Excluir nó")} title={t("Excluir nó")} onClick={() => setConfirmar(true)}>
          <Trash size={18} aria-hidden />
        </Button>
      </div>
    </div>}
    {children}
    <AlertDialog open={confirmar} onOpenChange={setConfirmar}>
      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("Excluir este nó?")}</AlertDialogTitle>
          <AlertDialogDescription>
            {label}. {t("Este nó e as arestas ligadas a ele serão removidos do rascunho. Use Desfazer para recuperar enquanto o editor estiver aberto.")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel>
          <AlertDialogAction onClick={() => { setConfirmar(false); acoes.onDelete(id); }}>{t("Excluir")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
