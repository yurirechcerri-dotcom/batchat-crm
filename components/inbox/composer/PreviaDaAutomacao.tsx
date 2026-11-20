"use client";

import Image from "next/image";
import type { FlowGraph, FlowNode } from "@/lib/followup/graph-schema";
import { useT } from "@/hooks/i18n/useT";

/** Mostra somente o percurso inicial determinístico, sem inventar respostas às bifurcações. */
export function percursoInicial(graph: FlowGraph) {
  const nodes: FlowNode[] = [];
  const visited = new Set<string>();
  let node: FlowNode | undefined = graph.nodes.find((n) => n.type === "trigger");
  while (node && !visited.has(node.id) && nodes.length < 20) {
    visited.add(node.id);
    if (node.type !== "trigger") nodes.push(node);
    if (["condition", "ai_classify", "match_reply", "collect", "repeat", "end"].includes(node.type)) break;
    const edges = graph.edges.filter((e) => e.source === node!.id);
    const edge = edges[0];
    if (edges.length !== 1 || !edge || edge.condition.type !== "always") break;
    node = graph.nodes.find((n) => n.id === edge.target);
  }
  return nodes;
}

function caminhoDaMidia(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed.pathname.toLowerCase() : null;
  } catch { return null; }
}

function MidiaDaPrevia({ url }: { url: string }) {
  const t = useT();
  const path = caminhoDaMidia(url);
  if (!path) return <span>{t("Mídia anexada")}</span>;
  if (/\.(png|jpe?g|webp|gif)$/.test(path)) return (
    <Image src={url} alt={t("Imagem da automação")} width={320} height={320} unoptimized
      className="h-auto max-h-64 w-full rounded-lg object-contain" />
  );
  if (/\.(mp3|ogg|opus|wav|m4a)$/.test(path)) return (
    <div className="flex min-h-11 items-center gap-3 rounded-xl bg-background/50 p-2">
      <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs text-accent-foreground">▶</span>
      <span aria-hidden="true" className="flex h-5 flex-1 items-center gap-0.5">
        {[6, 12, 8, 16, 10, 14, 6, 12, 18, 8, 14, 10, 6, 12, 8].map((h, i) => (
          <span key={i} className="w-0.5 rounded-full bg-text-muted/60" style={{ height: h }} />
        ))}
      </span>
      <span className="text-xs text-muted-foreground">{t("Áudio da automação")}</span>
    </div>
  );
  if (/\.(mp4|webm|mov)$/.test(path)) return <div className="rounded-lg border p-3">{t("Vídeo da automação")}</div>;
  return <a href={url} target="_blank" rel="noreferrer" className="underline">{t("Abrir mídia anexada")}</a>;
}

export function PreviaDaAutomacao({ graph }: { graph: FlowGraph }) {
  const t = useT();
  const nodes = percursoInicial(graph).filter((node) => node.type === "action");
  return (
    <div className="space-y-3" aria-label={t("Prévia das mensagens")}>
      <p className="text-xs text-muted-foreground">{t("Prévia estática das suas mensagens iniciais. Não envia nem reproduz áudio.")}</p>
      {nodes.length === 0 && <p>{t("Este fluxo não tem mensagens iniciais para exibir.")}</p>}
      {nodes.map((node) => {
        if (node.type === "action" && node.config.mode === "text") return (
          <div key={node.id} className="ml-4 space-y-2 rounded-2xl rounded-br-sm bg-muted p-3 text-sm shadow-sm">
            {node.config.media_url && <MidiaDaPrevia url={node.config.media_url} />}
            {node.config.body && <p className="whitespace-pre-wrap break-words">{node.config.body}</p>}
          </div>
        );
        return <div key={node.id} className="rounded-lg border border-dashed p-3 text-sm">
          <strong>{node.label}</strong>
          <p className="text-xs text-muted-foreground">
            {t("O conteúdo deste passo é resolvido durante a execução.")}
          </p>
        </div>;
      })}
    </div>
  );
}
