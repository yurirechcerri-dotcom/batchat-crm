// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { AcoesDoCartao, AcoesDoFluxoProvider } from "@/app/app/ai/followups/[id]/_components/AcoesDoCartao";
import { copiarNoDoFluxo } from "@/lib/followup/copiar-no";
import { fromReactFlow, toReactFlow } from "@/lib/followup/graph-mappers";

vi.mock("@xyflow/react", () => ({
  Position: { Top: "top" },
  NodeToolbar: ({ isVisible, children }: { isVisible: boolean; children: ReactNode }) => isVisible ? <div>{children}</div> : null,
}));
afterEach(() => { cleanup(); vi.useRealTimers(); });

function fixture(dragging = false, selected = false, onDuplicate = vi.fn(), onDelete = vi.fn()) {
  return <AcoesDoFluxoProvider value={{ dragging, onDuplicate, onDelete }}>
    <AcoesDoCartao id="wait-3" label="Espera" selected={selected} canDuplicate>
      <div>Espera de teste</div>
    </AcoesDoCartao>
  </AcoesDoFluxoProvider>;
}

describe("ações do cartão", () => {
  it("espera1s, cancela saída antecipada, e esconde durante arrasto", () => {
    vi.useFakeTimers();
    const { rerender } = render(fixture());
    const card = screen.getByTestId("node-actions-wait-3");
    fireEvent.mouseEnter(card);
    act(() => vi.advanceTimersByTime(999));
    expect(screen.queryByRole("button", { name: "Duplicar nó" })).not.toBeInTheDocument();
    fireEvent.mouseLeave(card);
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.queryByRole("button", { name: "Duplicar nó" })).not.toBeInTheDocument();
    fireEvent.mouseEnter(card);
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByRole("button", { name: "Duplicar nó" })).toBeVisible();
    rerender(fixture(true));
    expect(screen.queryByRole("button", { name: "Duplicar nó" })).not.toBeInTheDocument();
  });
  it("seleção por toque/teclado permite duplicar e exclusão exige confirmação", () => {
    const onDuplicate = vi.fn(); const onDelete = vi.fn();
    render(fixture(false, true, onDuplicate, onDelete));
    fireEvent.click(screen.getByRole("button", { name: "Duplicar nó" }));
    expect(onDuplicate).toHaveBeenCalledExactlyOnceWith("wait-3");
    fireEvent.click(screen.getByRole("button", { name: "Excluir nó" }));
    expect(onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Excluir nó" }));
    fireEvent.click(screen.getByRole("button", { name: "Excluir", exact: true }));
    expect(onDelete).toHaveBeenCalledExactlyOnceWith("wait-3");
  });
});

describe("cópia de nó", () => {
  it("conserva mídia/espera/configuração, muda ID e posição sem copiar estado visual", () => {
    const original = toReactFlow({ nodes: [{ id: "wait-3", type: "wait", label: "Espera", position: { x: 10, y: 20 }, config: { mode: "fixed", duration_ms: 36000000, preservar_prazo: true } }], edges: [] }).nodes[0];
    original.data.errors = ["velho"]; original.dragging = true;
    const copy = copiarNoDoFluxo(original, "wait-4");
    expect(copy).toMatchObject({ id: "wait-4", type: "wait", position: { x: 290, y: 60 }, data: { label: "Espera", config: original.data.config } });
    expect(copy?.data.errors).toBeUndefined();
    expect(copy?.dragging).toBeUndefined();
    expect(copy?.data.config).not.toBe(original.data.config);
    expect(fromReactFlow([original, copy!], []).edges).toEqual([]);
  });
  it("não duplica gatilho: evita criar duas entradas no grafo", () => {
    const node = toReactFlow({ nodes: [{ id: "t", type: "trigger", label: "Início", position: { x: 0, y: 0 }, config: {} }], edges: [] }).nodes[0];
    expect(copiarNoDoFluxo(node, "t-2")).toBeNull();
  });
});
