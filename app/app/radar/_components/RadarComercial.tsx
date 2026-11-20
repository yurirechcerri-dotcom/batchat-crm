"use client";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ArrowUpRight, Check, Radar } from "lucide-react";
import { apiClient } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { ROTULOS, ORIENTACOES } from "@/lib/radar/contrato";
import type { RadarConfig, RadarData } from "@/lib/radar/tipos";

const PAUSAS: Record<string, string> = {
  none: "Fluxo preservado", pending: "Pausa pendente: o motor está concluindo uma ação",
  paused: "Pausado para você atender", stale: "Atendimento mudou; pausa não aplicada", failed: "Pausa não confirmada",
};
const AVISOS: Record<string, string> = {
  disabled: "Aviso na Sexta desligado", pending: "Aviso aguardando envio", sending: "Enviando aviso",
  sent: "Aviso aceito pela Sexta", unknown: "Entrega do aviso incerta; confira a Sexta",
  failed: "Falha no aviso da Sexta", suppressed: "Sinal semelhante já avisado há menos de 30 min",
};
const FALHAS: Record<string, string> = {
  orcamento_atingido: "O limite de gasto de IA impediu a análise.", modelo_indisponivel: "Configure o modelo do Radar em Provedores.",
  classificacao_falhou: "A IA não conseguiu classificar. Confira esta conversa manualmente.",
  radar_pause_busy: "A pausa completa não foi confirmada. Abra a conversa e assuma o atendimento.",
  context_read_failed: "O contexto não pôde ser lido.",
};

export function RadarComercial({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient();
  const queryKey = ["radar-comercial", orgId];
  const query = useQuery({ queryKey, refetchInterval: 15_000, queryFn: () =>
    apiClient.get<{ data: RadarData }>("/api/v1/radar/comercial").then((r) => r.data) });
  const mutation = useMutation({
    mutationFn: (body: { config: Partial<RadarConfig> } | { resolve: string }) => apiClient.patch("/api/v1/radar/comercial", body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });
  if (query.isPending) return <p role="status">Carregando oportunidades…</p>;
  if (query.isError || !query.data) return <div role="alert" className="rounded-xl border p-4">Não foi possível carregar o Radar comercial. <Button variant="outline" onClick={() => query.refetch()}>Tentar novamente</Button></div>;
  const { config, canManage, items } = query.data;
  const options: Array<{ key: keyof RadarConfig; label: string }> = [
    { key: "enabled", label: "Identificar sinais comerciais" },
    { key: "auto_pause", label: "Pausar ao pedir humano, negociar ou fechar" },
    { key: "notify_sexta", label: "Avisar na Sexta-Feira" },
  ];
  return <section aria-label="Radar comercial" className="space-y-4">
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><Radar className="size-5" /> Onde você pode entrar</h2>
      <p className="text-sm text-muted-foreground">Interesse e dúvidas geram alertas. Compra, negociação e pedido de humano podem pausar para você atender. São sinais da IA, confira o trecho.</p>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {options.map(({ key, label }) => <label key={key} className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={config[key]} disabled={!canManage || mutation.isPending}
            onChange={(e) => mutation.mutate({ config: { [key]: e.target.checked } })} className="size-4 accent-primary" />{label}
        </label>)}
      </div>
      <p className="text-xs text-muted-foreground">Analisa novas mensagens e áudios já transcritos; usa créditos do modelo escolhido em <Link href="/app/ai/providers" className="underline">Provedores</Link>. Resolver o alerta não retoma a automação.</p>
      {mutation.isError && <p role="alert" className="text-destructive">Não foi possível salvar. Nada foi confirmado; tente novamente.</p>}
    </div>
    {!config.enabled && <p className="text-sm text-muted-foreground">Análise de novas mensagens desligada. Os alertas anteriores continuam disponíveis.</p>}
    {items.length === 0 && <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">Nenhum sinal pendente. As oportunidades aparecerão aqui conforme chegarem novas mensagens.</p>}
    <div className="grid gap-3 lg:grid-cols-2">
      {items.map((item) => <article key={item.id} className="rounded-xl border bg-card p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div><h3 className="font-semibold">{item.contact_name}</h3><p className="text-sm text-primary">{item.error_code ? "Análise não concluída" : ROTULOS[item.category]}</p></div>
          <span className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
        </div>
        {item.excerpt && <blockquote className="border-l-2 border-primary pl-3 text-sm whitespace-pre-wrap break-words">“{item.excerpt}”</blockquote>}
        <p className="text-sm">{item.error_code ? FALHAS[item.error_code] ?? "Confira esta conversa manualmente." : ORIENTACOES[item.category]}</p>
        <div className="space-y-1 text-xs text-muted-foreground">
          <p className="flex items-center gap-1"><AlertCircle className="size-3 shrink-0" />{PAUSAS[item.pause_status] ?? "Estado da pausa indisponível"}</p>
          <p>{AVISOS[item.notify_status] ?? "Aviso não confirmado"}</p>
          {!item.error_code && <p>Confiança da classificação: {item.confidence === "alta" ? "alta" : "moderada"}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" className="min-h-11"><Link href={`/app/inbox?id=${item.conversation_id}`}>Abrir conversa <ArrowUpRight className="size-4" /></Link></Button>
          <Button size="sm" variant="outline" className="min-h-11" disabled={mutation.isPending}
            onClick={() => mutation.mutate({ resolve: item.id })}><Check className="size-4" />Já cuidei</Button>
        </div>
      </article>)}
    </div>
  </section>;
}
