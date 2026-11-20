import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { HistoricoDisponivel } from "./HistoricoDisponivel";

const get = vi.fn();
const post = vi.fn();
vi.mock("@/lib/api/client", () => ({ apiClient: { get: (...args: unknown[]) => get(...args), post: (...args: unknown[]) => post(...args) } }));
const previa = { conversas: 2, mensagens: 5, audios: 1, imagens: 1, semConteudo: 1, existentesNoCrm: 2, parcial: true };
beforeEach(() => { get.mockReset(); post.mockReset(); });
it("não consulta ao abrir e não oferece importação ou envio", () => {
  render(<HistoricoDisponivel channelId="c1" />);
  expect(get).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: /importar|enviar/i })).toBeNull();
});
it("consulta a sessão e período escolhidos, distingue parcial e não escreve", async () => {
  get.mockResolvedValue({ data: { previa } });
  render(<HistoricoDisponivel channelId="c1" />);
  fireEvent.change(screen.getByRole("combobox", { name: "Período do histórico" }), { target: { value: "90" } });
  fireEvent.click(screen.getByRole("button", { name: "Consultar histórico disponível" }));
  await screen.findByText("Consulta parcial: os números abaixo são mínimos.");
  expect(get).toHaveBeenCalledWith("/api/v1/channel-sessions/c1/historico/disponivel?dias=90", expect.objectContaining({ timeoutMs: 70_000, retry: false, signal: expect.any(AbortSignal) }));
  expect(screen.getByText("2 conversas e 5 mensagens encontradas.")).toBeInTheDocument();
  expect(post).not.toHaveBeenCalled();
});
it("falha não parece histórico vazio e permite tentar novamente", async () => {
  get.mockRejectedValue(new Error("detalhe interno"));
  render(<HistoricoDisponivel channelId="c1" />);
  fireEvent.click(screen.getByRole("button", { name: "Consultar histórico disponível" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível consultar o histórico. Confira a conexão e tente novamente.");
  expect(screen.queryByText(/0 conversas/)).toBeNull();
  expect(screen.getByRole("button", { name: "Consultar histórico disponível" })).toBeEnabled();
});
it("resposta atrasada de outra sessão não aparece no canal atual", async () => {
  let resolver!: (value: unknown) => void;
  get.mockReturnValue(new Promise((resolve) => { resolver = resolve; }));
  const tela = render(<HistoricoDisponivel channelId="c1" />);
  fireEvent.click(screen.getByRole("button", { name: "Consultar histórico disponível" }));
  tela.rerender(<HistoricoDisponivel channelId="c2" />);
  expect(get.mock.calls[0]![1].signal.aborted).toBe(true);
  resolver({ data: { previa } });
  await waitFor(() => expect(screen.getByRole("button", { name: "Consultar histórico disponível" })).toBeEnabled());
  expect(screen.queryByText("2 conversas e 5 mensagens encontradas.")).toBeNull();
});
