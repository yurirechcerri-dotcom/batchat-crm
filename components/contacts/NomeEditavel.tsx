"use client";

import { useEffect, useRef, useState } from "react";

import { useT } from "@/hooks/i18n/useT";
import { useUpdateContact } from "@/hooks/contacts/useUpdateContact";
import { PencilSimple, Check, X } from "@/lib/ui/icons";

/**
 * O nome do contato que se edita ali mesmo, sem abrir diálogo.
 *
 * Lead novo chega sem nome (só telefone, ou "."): a pessoa precisa batizar no
 * instante em que está atendendo, não ir até a ficha. Enter salva, Esc cancela.
 * Quem não pode escrever (`somenteLeitura`) vê só o nome.
 */
export function NomeEditavel({
  contactId,
  rotulo,
  nomeAtual,
  somenteLeitura = false,
}: {
  contactId: string;
  /** Como o contato aparece hoje (nome, telefone ou "Sem nome"). */
  rotulo: string;
  /** O valor cru da coluna `name`, para preencher o campo. */
  nomeAtual: string | null | undefined;
  somenteLeitura?: boolean;
}) {
  const t = useT();
  const atualizar = useUpdateContact(contactId);
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(nomeAtual ?? "");
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editando) setValor(nomeAtual ?? "");
  }, [nomeAtual, editando]);

  useEffect(() => {
    if (editando) campo.current?.select();
  }, [editando]);

  async function salvar() {
    const limpo = valor.trim();
    if (limpo === "" || limpo === (nomeAtual ?? "").trim()) {
      setEditando(false);
      return;
    }
    try {
      await atualizar.mutateAsync({ name: limpo });
      setEditando(false);
    } catch {
      // `useUpdateContact` já mostra o erro; o campo fica aberto para tentar de novo.
    }
  }

  if (!editando) {
    return (
      <div className="bc-nome-editavel flex min-w-0 items-center gap-1.5">
        <span className="min-w-0 break-words font-medium">{rotulo}</span>
        {!somenteLeitura && (
          <button
            type="button"
            className="bc-nome-editavel__lapis inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 lg:h-6 lg:w-6"
            title={t("Editar nome")}
            aria-label={t("Editar nome")}
            onClick={() => setEditando(true)}
          >
            <PencilSimple size={14} weight="regular" aria-hidden />
          </button>
        )}
      </div>
    );
  }

  return (
    <form
      className="flex items-center gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        void salvar();
      }}
    >
      <input
        ref={campo}
        value={valor}
        maxLength={200}
        autoFocus
        disabled={atualizar.isPending}
        aria-label={t("Nome do contato")}
        placeholder={t("Nome do contato")}
        className="h-9 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm lg:h-8"
        onChange={(e) => setValor(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setEditando(false);
        }}
      />
      <button
        type="submit"
        className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground disabled:opacity-60 lg:h-8 lg:w-8"
        disabled={atualizar.isPending || valor.trim() === ""}
        title={t("Salvar nome")}
        aria-label={t("Salvar nome")}
      >
        <Check size={14} weight="bold" aria-hidden />
      </button>
      <button
        type="button"
        className="inline-flex h-9 w-9 items-center justify-center rounded-md border lg:h-8 lg:w-8"
        onClick={() => setEditando(false)}
        title={t("Cancelar")}
        aria-label={t("Cancelar")}
      >
        <X size={14} weight="bold" aria-hidden />
      </button>
    </form>
  );
}
