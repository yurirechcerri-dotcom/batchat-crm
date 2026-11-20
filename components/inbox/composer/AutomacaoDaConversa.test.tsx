import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AutomacaoDaConversa } from "./AutomacaoDaConversa";

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ apiClient: { get, post } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const fluxo = { id: "fluxo", name: "Esteira 147", status: "active", active_version_id: "v1" };
const inscricao = {
  id: "inscricao", pointer_id: "fluxo", contact_id: "contato", conversation_id: "conversa", expected_version_id: "v1",
  status: "paused_manual", started_at: "2026-11-14", updated_at: "2026-11-14",
};
const props = {
  contactId: "contato", conversationId: "conversa", organizationId: "org",
  somenteLeitura: false, podeParar: true, bloqueado: false,
};

const graph = { nodes: [
  { id: "t", type: "trigger", label: "Início", position: { x: 0, y: 0 }, config: {} },
  { id: "m", type: "action", label: "Olá", position: { x: 0, y: 1 }, config: { mode: "text", body: "Mensagem da versão publicada" } },
], edges: [{ id: "tm", source: "t", target: "m", priority: 0, condition: { type: "always" } }] };

function respostas(enrollments = [inscricao], flows = [fluxo], podeInscrever = true) {
  get.mockImplementation(async (url: string) => url.endsWith("/preview")
    ? { data: { id: "fluxo", name: "Esteira 147", version_id: "v1", graph } }
    : url.includes("followup-flows")
    ? { data: flows } : { data: enrollments, meta: { pode_inscrever: podeInscrever } });
}

function montar(overrides: Partial<typeof props> = {}) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const painel = (next = overrides) => <QueryClientProvider client={client}>
    <AutomacaoDaConversa {...props} {...next} />
  </QueryClientProvider>;
  return { ...render(painel()), painel };
}

describe("automação explícita na conversa", () => {
  beforeEach(() => { vi.clearAllMocks(); respostas(); post.mockResolvedValue({ data: {} }); });

  it("abrir não escreve; retoma somente a inscrição desta conversa", async () => {
    montar();
    expect(get).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Automação" }));
    const retomar = await screen.findByRole("button", { name: "Retomar de onde parou" });
    expect(post).not.toHaveBeenCalled();
    await userEvent.click(retomar);
    await waitFor(() => expect(post).toHaveBeenCalledExactlyOnceWith(
      "/api/v1/ai/followups/enrollments/inscricao/resume", {},
    ));
  });

  it("escolher não envia; iniciar usa fluxo, contato e conversa selecionados", async () => {
    respostas([]);
    montar();
    await userEvent.click(screen.getByRole("button", { name: "Automação" }));
    await userEvent.click(await screen.findByRole("button", { name: /Esteira 147/ }));
    await screen.findByText("Mensagem da versão publicada");
    await userEvent.click(screen.getByRole("button", { name: "Selecionar esta automação" }));
    expect(post).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Confirmar e iniciar" }));
    await waitFor(() => expect(post).toHaveBeenCalledExactlyOnceWith(
      "/api/v1/ai/followups/enrollments", {
        pointer_id: "fluxo", contact_id: "contato", conversation_id: "conversa", expected_version_id: "v1",
      },
    ));
  });

  it.each(["outra-conversa", undefined])("não retoma inscrição com conversa %s", async (conversation_id) => {
    respostas([{ ...inscricao, conversation_id } as typeof inscricao]);
    montar();
    await userEvent.click(screen.getByRole("button", { name: "Automação" }));
    await screen.findByText(/Este contato tem um fluxo vinculado/);
    expect(screen.queryByRole("button", { name: "Retomar de onde parou" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Parar follow-up" })).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(post).not.toHaveBeenCalled();
  });

  it("biblioteca vazia explica a ausência e oferece caminho para os fluxos", async () => {
    respostas([], []);
    montar();
    await userEvent.click(screen.getByRole("button", { name: "Automação" }));
    await screen.findByText("Nenhum fluxo publicado disponível para iniciar.");
    expect(screen.getByRole("link", { name: "Abrir biblioteca de fluxos" }).getAttribute("href"))
      .toBe("/app/ai/followups");
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("falha de leitura não vira biblioteca vazia e permite tentar novamente", async () => {
    get.mockRejectedValue(new Error("offline"));
    montar();
    await userEvent.click(screen.getByRole("button", { name: "Automação" }));
    await screen.findByRole("alert");
    expect(screen.queryByText("Nenhum fluxo publicado disponível para iniciar.")).toBeNull();
    respostas();
    await userEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    await screen.findByRole("button", { name: "Retomar de onde parou" });
    expect(post).not.toHaveBeenCalled();
  });

  it.each(["somenteLeitura", "bloqueado"] as const)("%s impede iniciar e retomar", async (field) => {
    montar({ [field]: true });
    await userEvent.click(screen.getByRole("button", { name: "Automação" }));
    await screen.findAllByText("Esteira 147");
    expect(screen.queryByRole("button", { name: "Retomar de onde parou" })).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(post).not.toHaveBeenCalled();
  });

  it("não inicia sem capacidade retornada pelo servidor", async () => {
    respostas([], [fluxo], false);
    montar();
    await userEvent.click(screen.getByRole("button", { name: "Automação" }));
    await screen.findByText("Iniciar um fluxo está indisponível para este atendimento ou seu acesso.");
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("passagem humana permanece sem retomada manual", async () => {
    respostas([{ ...inscricao, status: "paused_handoff" }]);
    montar();
    await userEvent.click(screen.getByRole("button", { name: "Automação" }));
    await screen.findByText("Fluxo pausado por passagem humana. Consulte os detalhes antes de continuar.");
    expect(screen.queryByRole("button", { name: "Retomar de onde parou" })).toBeNull();
  });

  it("trocar de conversa fecha o painel e descarta a ação anterior", async () => {
    const { rerender, painel } = montar();
    await userEvent.click(screen.getByRole("button", { name: "Automação" }));
    await screen.findByRole("button", { name: "Retomar de onde parou" });
    rerender(painel({ conversationId: "outra" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("button", { name: "Retomar de onde parou" })).toBeNull();
    expect(post).not.toHaveBeenCalled();
  });
});
