// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { useHistoricoDoFluxo } from "@/hooks/followup/useHistoricoDoFluxo";
import type { FlowGraph } from "@/lib/followup/graph-schema";

const original: FlowGraph = { nodes: [
  { id: "a", type: "trigger", label: "Início", position: { x: 0, y: 0 }, config: {} },
  { id: "b", type: "end", label: "Fim", position: { x: 0, y: 100 }, config: { outcome: "exhausted" } },
], edges: [{ id: "ab", source: "a", target: "b", priority: 0, condition: { type: "always" } }] };

describe("histórico do editor", () => {
  it("recupera nó e ligação juntos; refaz e invalida refazer após nova edição", () => {
    const { result } = renderHook(() => {
      const [graph, setGraph] = useState(original);
      const history = useHistoricoDoFluxo(graph, setGraph, false);
      return { graph, setGraph, history };
    });
    act(() => result.current.setGraph({ nodes: original.nodes.slice(0, 1), edges: [] }));
    expect(result.current.history.canUndo).toBe(true);
    act(() => result.current.history.undo());
    expect(result.current.graph).toEqual(original);
    expect(result.current.history.canRedo).toBe(true);
    act(() => result.current.history.redo());
    expect(result.current.graph.edges).toEqual([]);
    act(() => result.current.history.undo());
    act(() => result.current.setGraph({ ...original, settings: { cadencia_estendida: true, max_tentativas_pergunta: 3 } }));
    expect(result.current.history.canRedo).toBe(false);
    act(() => result.current.history.undo());
    expect(result.current.graph.settings).toBeUndefined();
  });
});
