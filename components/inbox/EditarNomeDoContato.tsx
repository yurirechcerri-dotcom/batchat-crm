"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PencilSimple } from "@/lib/ui/icons";
import { useUpdateContact } from "@/hooks/contacts/useUpdateContact";
import { useT } from "@/hooks/i18n/useT";

interface Props {
  contactId: string | null | undefined;
  /** O que a equipe vê hoje (nome salvo ou, na falta dele, o nome do WhatsApp). */
  rotulo: string;
  /** O nome SALVO no contato; vazio quando o contato só tem o nome do WhatsApp. */
  nomeSalvo: string | null | undefined;
  desabilitado?: boolean;
  /** Chamado depois de gravar, para a tela reler o contato. */
  aoSalvar?: () => void;
}

/**
 * Nome do contato com lápis, na ficha: toca no lápis, edita, salva. Grava só `name`
 * (o PATCH de contato já existe); o nome do WhatsApp não é tocado. Nome vazio não
 * grava — apagar o nome por engano deixaria o contato sem rótulo na lista.
 */
export function EditarNomeDoContato({ contactId, rotulo, nomeSalvo, desabilitado, aoSalvar }: Props) {
  const t = useT();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState("");
  const atualizar = useUpdateContact(contactId ?? "");
  const limpo = valor.trim();

  const abrir = () => {
    setValor(nomeSalvo?.trim() || "");
    setEditando(true);
  };
  const salvar = () => {
    if (!contactId || limpo === "") return;
    atualizar.mutate(
      { name: limpo },
      {
        onSuccess: () => {
          setEditando(false);
          aoSalvar?.();
        },
      },
    );
  };

  if (!editando) {
    return (
      <div className="flex min-w-0 items-center gap-1">
        <div className="min-w-0 truncate font-medium">{rotulo}</div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-11 shrink-0 lg:size-7"
          aria-label={t("Editar nome")}
          title={t("Editar nome do contato")}
          data-testid="editar-nome-do-contato"
          disabled={desabilitado || !contactId}
          onClick={abrir}
        >
          <PencilSimple size={16} aria-hidden />
        </Button>
      </div>
    );
  }
  return (
    <form
      className="flex w-full items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        salvar();
      }}
    >
      <Input
        autoFocus
        value={valor}
        maxLength={120}
        aria-label={t("Nome do contato")}
        className="h-11 min-w-0 flex-1 text-base md:text-sm lg:h-8"
        onChange={(e) => setValor(e.target.value)}
      />
      <Button type="submit" size="sm" className="h-11 lg:h-8" disabled={limpo === "" || atualizar.isPending}>
        {t("Salvar")}
      </Button>
      <Button type="button" size="sm" variant="ghost" className="h-11 lg:h-8" onClick={() => setEditando(false)}>
        {t("Cancelar")}
      </Button>
    </form>
  );
}
