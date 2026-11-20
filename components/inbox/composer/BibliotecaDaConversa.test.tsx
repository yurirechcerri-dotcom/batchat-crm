import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BibliotecaDaConversa } from "./BibliotecaDaConversa";
import { percursoInicial } from "./PreviaDaAutomacao";
import type { FlowGraph } from "@/lib/followup/graph-schema";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ apiClient: { get } }));
const graph: FlowGraph = {
  nodes: [
    { id: "t", type: "trigger", label: "Início", position: { x: 0, y: 0 }, config: {} },
    { id: "m", type: "action", label: "Mensagem", position: { x: 0, y: 0 }, config: { mode: "text", body: "Muito prazer!" } },
    { id: "e", type: "end", label: "Fim", position: { x: 0, y: 0 }, config: { outcome: "exhausted" } },
  ], edges: [
    { id: "tm", source: "t", target: "m", priority: 0, condition: { type: "always" } },
    { id: "me", source: "m", target: "e", priority: 0, condition: { type: "always" } },
  ],
};
const flows = [
  { id: "a", name: "Esteira 147", status: "active", active_version_id: "v1" },
  { id: "b", name: "Pós-venda", status: "active", active_version_id: "v2" },
  { id: "c", name: "Rascunho", status: "draft", active_version_id: null },
];
const confirmar = vi.fn();
function montar(podeIniciar = true) {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <BibliotecaDaConversa flows={flows} organizationId="org" contactName="Contato de teste"
      podeIniciar={podeIniciar} salvando={false} aoConfirmar={confirmar} />
  </QueryClientProvider>);
}
beforeEach(() => {
  vi.clearAllMocks(); confirmar.mockResolvedValue(true);
  get.mockImplementation(async (url: string) => ({ data: {
    id: url.includes("/a/") ? "a" : "b", name: url.includes("/a/") ? "Esteira 147" : "Pós-venda",
    version_id: "versao-publicada", graph,
  } }));
});

describe("biblioteca com prévia e confirmação", () => {
  it("pesquisa cards, mantém rascunhos indisponíveis e não inicia ao escolher", async () => {
    montar();
    expect(screen.getByRole("button", { name: /Rascunho/ })).toBeDisabled();
    await userEvent.type(screen.getByRole("searchbox"), "147");
    expect(screen.queryByRole("button", { name: /Pós-venda/ })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /Esteira 147/ }));
    await screen.findByText("Muito prazer!");
    expect(confirmar).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Selecionar esta automação" }));
    expect(screen.getByText("Iniciar Esteira 147 para Contato de teste?")).toBeTruthy();
    expect(confirmar).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Voltar à prévia" }));
    expect(confirmar).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Selecionar esta automação" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirmar e iniciar" }));
    expect(confirmar).toHaveBeenCalledExactlyOnceWith({ id: "a", versionId: "versao-publicada" });
  });

  it("mudar de card descarta a confirmação e nunca mostra resposta atrasada do anterior", async () => {
    montar();
    await userEvent.click(screen.getByRole("button", { name: /Esteira 147/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Selecionar esta automação" }));
    let resolve!: (value: unknown) => void;
    get.mockImplementation(() => new Promise((r) => { resolve = r; }));
    await userEvent.click(screen.getByRole("button", { name: /Pós-venda/ }));
    expect(screen.queryByRole("button", { name: "Confirmar e iniciar" })).toBeNull();
    expect(screen.queryByText("Muito prazer!")).toBeNull();
    resolve({ data: { id: "b", name: "Pós-venda", version_id: "v2", graph } });
    await screen.findByText("Muito prazer!");
    expect(confirmar).not.toHaveBeenCalled();
  });

  it("falha de prévia impede confirmar e oferece nova leitura", async () => {
    get.mockRejectedValue(new Error("offline")); montar();
    await userEvent.click(screen.getByRole("button", { name: /Esteira 147/ }));
    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: "Selecionar esta automação" })).toBeDisabled();
    expect(confirmar).not.toHaveBeenCalled();
  });

  it("somente leitura permite conferir a prévia, mas não iniciar", async () => {
    montar(false);
    await userEvent.click(screen.getByRole("button", { name: /Esteira 147/ }));
    expect(await screen.findByRole("button", { name: "Selecionar esta automação" })).toBeDisabled();
    expect(confirmar).not.toHaveBeenCalled();
  });

  it("versão recusada exige prévia nova e outra confirmação", async () => {
    confirmar.mockResolvedValue(false); montar();
    await userEvent.click(screen.getByRole("button", { name: /Esteira 147/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Selecionar esta automação" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirmar e iniciar" }));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("button", { name: "Confirmar e iniciar" })).toBeNull();
  });

  it("a prévia não concatena ramificações como se todas fossem enviadas", () => {
    expect(percursoInicial({ ...graph, edges: [...graph.edges, { id: "other", source: "m", target: "t", priority: 1, condition: { type: "always" } }] }).map((n) => n.id)).toEqual(["m"]);
  });
});
