"use client";

import { useState } from "react";
import { graphsEqual } from "@/lib/followup/graph-mappers";
import type { FlowGraph } from "@/lib/followup/graph-schema";

interface Historico { anteriores: FlowGraph[]; atual: FlowGraph; proximos: FlowGraph[] }
export function registrarEdicao(history: Historico, graph: FlowGraph): Historico {
  if (graphsEqual(history.atual, graph)) return history;
  return { anteriores: [...history.anteriores, history.atual].slice(-100), atual: graph, proximos: [] };
}

/** Snapshot do grafo inteiro: apagar nó e ligações é uma única alteração. */
export function useHistoricoDoFluxo(graph: FlowGraph, restaurar: (graph: FlowGraph) => void, arrastando: boolean) {
  const [history, setHistory] = useState<Historico>(() => ({ anteriores: [], atual: graph, proximos: [] }));
  const [revision, setRevision] = useState(0);
  // Ajuste condicionado ao snapshot recebido, antes de renderizar os controles.
  // Seleção, medições do canvas e erros de validação não pertencem ao grafo.
  if (!arrastando && !graphsEqual(history.atual, graph)) setHistory(registrarEdicao(history, graph));

  function mover(direcao: "desfazer" | "refazer") {
    const source = direcao === "desfazer" ? history.anteriores : history.proximos;
    const target = source.at(-1);
    if (!target) return;
    setHistory(direcao === "desfazer"
      ? { anteriores: source.slice(0, -1), atual: target, proximos: [...history.proximos, history.atual] }
      : { anteriores: [...history.anteriores, history.atual], atual: target, proximos: source.slice(0, -1) });
    setRevision((value) => value + 1);
    restaurar(target);
  }
  return { canUndo: history.anteriores.length > 0, canRedo: history.proximos.length > 0,
    undo: () => mover("desfazer"), redo: () => mover("refazer"), revision };
}
