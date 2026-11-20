"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api/client";
import type { FlowGraph } from "@/lib/followup/graph-schema";
import { useT } from "@/hooks/i18n/useT";
import { PreviaDaAutomacao } from "./PreviaDaAutomacao";

export interface FluxoDaBiblioteca {
  id: string; name: string; status: string; active_version_id: string | null;
}
interface Props {
  flows: FluxoDaBiblioteca[];
  organizationId?: string;
  contactName?: string | null;
  podeIniciar: boolean;
  salvando: boolean;
  aoConfirmar: (flow: { id: string; versionId: string }) => Promise<boolean>;
}
type Previa = { id: string; name: string; version_id: string; graph: FlowGraph };

export function BibliotecaDaConversa({ flows, organizationId, contactName, podeIniciar, salvando, aoConfirmar }: Props) {
  const t = useT();
  const [busca, setBusca] = useState("");
  const [escolhido, setEscolhido] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const escolhidoNaLista = flows.find((flow) => flow.id === escolhido);
  const preview = useQuery({
    queryKey: ["automacao-preview", organizationId, escolhido, escolhidoNaLista?.active_version_id],
    enabled: Boolean(escolhido), retry: false,
    queryFn: async () => (await apiClient.get<{ data: Previa }>(
      `/api/v1/ai/followup-flows/${encodeURIComponent(escolhido)}/preview`,
    )).data,
  });
  const data = preview.data?.id === escolhido && !preview.isError && !preview.isFetching ? preview.data : null;
  const disponivelNaLista = (flow: FluxoDaBiblioteca) => flow.status === "active" && Boolean(flow.active_version_id);
  // Publicados primeiro: o rascunho "indisponível" não pode empurrar o que dá para escolher para baixo da dobra.
  const filtrados = flows
    .filter((flow) => flow.name.toLocaleLowerCase().includes(busca.toLocaleLowerCase().trim()))
    .sort((a, b) => Number(disponivelNaLista(b)) - Number(disponivelNaLista(a)));
  async function confirmar() {
    if (!data || !podeIniciar || salvando || !confirmando) return;
    const iniciou = await aoConfirmar({ id: data.id, versionId: data.version_id });
    setConfirmando(false);
    if (!iniciou) void preview.refetch();
  }
  return (
    <div className="mt-3 grid min-w-0 gap-4 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <section className="min-w-0 space-y-2" aria-label={t("Biblioteca de fluxos")}>
        <input type="search" aria-label={t("Pesquisar fluxos")} placeholder={t("Pesquisar fluxos")}
          value={busca} onChange={(e) => setBusca(e.target.value)}
          className="h-11 w-full rounded-xl border bg-background px-4 text-base md:text-sm" />
        <div role="region" aria-label={t("Automações disponíveis")} tabIndex={0}
          className="max-h-44 space-y-2 overflow-y-auto overscroll-contain rounded-2xl border border-border p-2 md:h-72 md:max-h-72">
          {filtrados.length === 0 && <p className="p-2 text-sm text-muted-foreground">{t("Nenhum fluxo encontrado.")}</p>}
          {filtrados.map((flow) => {
            const disponivel = flow.status === "active" && Boolean(flow.active_version_id);
            return <button key={flow.id} type="button" disabled={!disponivel || salvando}
              aria-pressed={escolhido === flow.id}
              onClick={() => { setEscolhido(flow.id); setConfirmando(false); }}
              className={`min-h-16 w-full rounded-xl border p-3 text-left shadow-sm transition-all duration-150 disabled:opacity-50 ${escolhido === flow.id ? "border-accent bg-accent/10 shadow-md" : "border-border hover:-translate-y-px hover:bg-muted hover:shadow-md"}`}>
              <span className="block break-words text-sm font-medium">{flow.name}</span>
              <span className="text-xs text-muted-foreground">{disponivel ? t("Publicado") : t("Indisponível para iniciar")}</span>
            </button>;
          })}
        </div>
      </section>
      <section aria-label={t("Pré-visualizar automação")} className="min-w-0 rounded-2xl border border-border bg-surface-elevated p-4 shadow-sm">
        {!escolhido ? <p className="py-12 text-center text-sm text-muted-foreground">{t("Selecione uma automação para ver a prévia.")}</p> : (
          <>
            <h4 className="mb-3 break-words font-semibold">{data?.name ?? escolhidoNaLista?.name}</h4>
            {preview.isFetching && <p role="status">{t("Carregando prévia…")}</p>}
            {preview.isError && <div role="alert" className="space-y-2">
              <p>{t("Não foi possível carregar a prévia. Nenhuma mensagem foi enviada.")}</p>
              <Button variant="outline" onClick={() => { void preview.refetch(); }}>{t("Tentar novamente")}</Button>
            </div>}
            {data && !confirmando && <>
              <div role="region" aria-label={t("Percurso inicial do fluxo")} tabIndex={0} className="max-h-56 overflow-y-auto overscroll-contain pr-1 md:max-h-64">
                <PreviaDaAutomacao graph={data.graph} />
              </div>
            </>}
          </>
        )}
      </section>
      {/* Rodapé fixo: o botão de escolher nunca fica escondido abaixo da dobra (na web ele sumia). */}
      <footer className="sticky bottom-0 z-10 -mx-6 border-t border-border bg-surface px-6 py-3 md:col-span-2">
        {data && confirmando ? (
          <div className="space-y-2" role="group" aria-label={t("Confirmar automação")}>
            <p className="text-sm font-medium">{t("Iniciar {fluxo} para {contato}?").replace(/\{(fluxo|contato)\}/g, (_, key: string) => key === "fluxo" ? data.name : contactName || t("esta conversa"))}</p>
            <p className="text-xs text-muted-foreground">{t("O fluxo começa do início e pode enviar mensagens reais. Confira o destinatário antes de confirmar.")}</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={salvando} onClick={() => setConfirmando(false)}>{t("Voltar à prévia")}</Button>
              <Button disabled={!podeIniciar || salvando} onClick={() => { void confirmar(); }}>{t("Confirmar e iniciar")}</Button>
            </div>
          </div>
        ) : (
          <Button className="min-h-11 w-full whitespace-normal" disabled={!data || !podeIniciar || salvando}
            onClick={() => setConfirmando(true)}>{t("Selecionar esta automação")}</Button>
        )}
      </footer>
    </div>
  );
}
