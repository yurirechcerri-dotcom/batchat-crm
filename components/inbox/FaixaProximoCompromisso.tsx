"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";
import { useT } from "@/hooks/i18n/useT";
import { CalendarBlank } from "@/lib/ui/icons";

interface Item {
  id: string;
  titulo: string;
  iniciaEm: string;
  situacao: string;
  contatoNome?: string | null;
}

/**
 * Faixa âmbar do próximo compromisso (foto 2 do Yuri), só no celular, embaixo da lista de conversas.
 * Leitura silenciosa: sem módulo de agenda, sem permissão ou sem nada marcado, a faixa simplesmente não aparece
 * (nunca vira aviso vermelho na cara de quem só quer ver as conversas).
 */
export function FaixaProximoCompromisso() {
  const t = useT();
  const { data } = useQuery({
    queryKey: ["agenda", "proximo-compromisso"],
    staleTime: 60_000,
    retry: false,
    queryFn: async (): Promise<Item | null> => {
      const agora = new Date();
      const ate = new Date(agora.getTime() + 48 * 3_600_000);
      const qs = new URLSearchParams({ de: agora.toISOString(), ate: ate.toISOString() });
      const r = await apiClient.get<{ data?: Item[] } | Item[]>(`/api/v1/agenda/agendamentos?${qs.toString()}`);
      const lista = Array.isArray(r) ? r : (r.data ?? []);
      const futuros = lista
        .filter((a) => !/cancel/i.test(a.situacao) && new Date(a.iniciaEm).getTime() >= agora.getTime())
        .sort((a, b) => a.iniciaEm.localeCompare(b.iniciaEm));
      return futuros[0] ?? null;
    },
  });
  if (!data) return null;
  const hora = new Date(data.iniciaEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return (
    <Link
      href="/app/agenda"
      data-bc-faixa-agenda=""
      className="mx-3 mb-3 mt-2 flex items-center gap-3 rounded-2xl bg-accent px-4 py-3 text-accent-foreground md:hidden"
    >
      <CalendarBlank size={26} weight="regular" aria-hidden />
      <span className="min-w-0 border-l border-current/30 pl-3">
        <span className="block text-[11px] font-medium uppercase tracking-wide opacity-80">{t("Próximo compromisso")}</span>
        <span className="block truncate text-sm font-semibold">
          {hora} · {data.contatoNome ?? data.titulo}
        </span>
      </span>
    </Link>
  );
}
