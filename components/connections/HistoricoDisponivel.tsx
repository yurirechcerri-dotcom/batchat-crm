"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api/client";
import { useT } from "@/hooks/i18n/useT";

type Previa = {
  conversas: number; mensagens: number; audios: number; imagens: number;
  semConteudo: number; existentesNoCrm: number; parcial: boolean;
};

/** Consulta deliberada: abrir a tela nunca começa a varrer conversas. */
export function HistoricoDisponivel({ channelId }: { channelId: string }) {
  return <HistoricoDaSessao key={channelId} channelId={channelId} />;
}

function HistoricoDaSessao({ channelId }: { channelId: string }) {
  const t = useT();
  const [dias, setDias] = useState("30");
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState(false);
  const geracao = useRef(0);
  const pendente = useRef<AbortController | null>(null);
  useEffect(() => () => { geracao.current += 1; pendente.current?.abort(); }, []);
  async function consultar() {
    const pedido = ++geracao.current;
    pendente.current?.abort();
    const controller = new AbortController();
    pendente.current = controller;
    setOcupado(true); setErro(false); setPrevia(null);
    try {
      const resposta = await apiClient.get<{ data: { previa: Previa } }>(
        `/api/v1/channel-sessions/${channelId}/historico/disponivel?dias=${dias}`,
        { timeoutMs: 70_000, retry: false, signal: controller.signal },
      );
      if (pedido === geracao.current) setPrevia(resposta.data.previa);
    } catch {
      if (pedido === geracao.current) setErro(true);
    } finally {
      if (pedido === geracao.current) setOcupado(false);
    }
  }
  return (
    <section className="space-y-3 rounded-lg border p-4" aria-label={t("Histórico disponível")}>
      <h3 className="text-sm font-semibold">{t("Histórico disponível")}</h3>
      <p className="text-xs text-muted-foreground">
        {t("Consulte o que a conexão oferece antes de migrar. Esta consulta não importa conversas nem envia mensagens.")}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label={t("Período do histórico")} value={dias} disabled={ocupado}
          onChange={(e) => { setDias(e.target.value); setPrevia(null); }}
          className="rounded-md border bg-background px-2 py-2 text-sm">
          {[30, 90, 180, 365].map((d) => <option key={d} value={d}>{t("Últimos {dias} dias").replace("{dias}", String(d))}</option>)}
        </select>
        <Button variant="outline" disabled={ocupado} onClick={() => void consultar()}>
          {ocupado ? t("Consultando histórico…") : t("Consultar histórico disponível")}
        </Button>
      </div>
      {erro && <p role="alert" className="text-sm text-destructive">{t("Não foi possível consultar o histórico. Confira a conexão e tente novamente.")}</p>}
      {previa && <div role="status" className="space-y-1 text-sm">
        {previa.parcial && <p>{t("Consulta parcial: os números abaixo são mínimos.")}</p>}
        <p>{t("{conversas} conversas e {mensagens} mensagens encontradas.").replace("{conversas}", String(previa.conversas)).replace("{mensagens}", String(previa.mensagens))}</p>
        <p>{t("{audios} áudios, {imagens} imagens e {semConteudo} mensagens sem conteúdo disponível.").replace("{audios}", String(previa.audios)).replace("{imagens}", String(previa.imagens)).replace("{semConteudo}", String(previa.semConteudo))}</p>
        <p>{t("{existentes} mensagens já estão neste canal do CRM.").replace("{existentes}", String(previa.existentesNoCrm))}</p>
        <p className="text-xs text-muted-foreground">{t("O provedor pode limitar o histórico anterior à conexão. Esta contagem não comprova que todo o período está disponível para importar.")}</p>
      </div>}
    </section>
  );
}
