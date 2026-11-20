/**
 * A galeria de automações: cartões enxutos por canal, "Do zero", e o formulário
 * mínimo (palavra, link, mensagem escrita no balão) que manda o pedido certo.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ mutate: vi.fn(), push: vi.fn() }));
vi.mock("@/hooks/followup/useInstalarPalavraChave", () => ({
  useInstalarPalavraChave: () => ({ mutate: m.mutate, isPending: false }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: m.push }) }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (text: string) => text }));

import { ModelosDeAutomacaoDialog } from "@/app/app/ai/followups/_components/ModelosDeAutomacaoDialog";

beforeEach(() => vi.clearAllMocks());

function abrir(extra: { aoComecarDoZero?: () => void } = {}) {
  const onOpenChange = vi.fn();
  render(<ModelosDeAutomacaoDialog open onOpenChange={onOpenChange} aoComecarDoZero={extra.aoComecarDoZero ?? vi.fn()} />);
  return onOpenChange;
}

describe("galeria", () => {
  it("mostra os três modelos e o cartão Do zero, sem parágrafo dentro dos cartões", () => {
    abrir();
    for (const titulo of ["Entregar material", "Enviar link", "Responder dúvida", "Do zero"]) {
      expect(screen.getByText(titulo)).toBeInTheDocument();
    }
    // O cartão é ícone + título + fluxo: nenhuma frase longa.
    for (const botao of screen.getAllByRole("button").filter((b) => b.hasAttribute("data-bc-auto-card"))) {
      expect((botao.textContent ?? "").length).toBeLessThan(60);
    }
  });

  it("cada cartão desenha o fluxo com a palavra sugerida", () => {
    abrir();
    expect(screen.getByText("AGENTES")).toBeInTheDocument();
    expect(screen.getByText("QUERO")).toBeInTheDocument();
  });

  it("o Instagram mostra os mesmos modelos com a nota curta do canal", () => {
    abrir();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Instagram" }), { button: 0 });
    fireEvent.click(screen.getByRole("tab", { name: "Instagram" }));
    expect(screen.getByText("No Instagram: só por mensagem direta.")).toBeInTheDocument();
  });

  it("Do zero fecha a galeria e abre o novo fluxo", () => {
    const doZero = vi.fn();
    const onOpenChange = abrir({ aoComecarDoZero: doZero });
    fireEvent.click(screen.getByText("Do zero"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(doZero).toHaveBeenCalled();
  });
});

describe("instalar", () => {
  it("já vem com a palavra AGENTES e só libera depois do link", () => {
    abrir();
    fireEvent.click(screen.getByText("Entregar material"));
    expect(screen.getByLabelText("Palavra")).toHaveValue("AGENTES");
    const instalar = screen.getByRole("button", { name: "Instalar" });
    expect(instalar).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Link"), { target: { value: "https://exemplo.com/guia" } });
    expect(instalar).toBeEnabled();
    // A prévia é a conversa: o cliente manda a palavra, o balão traz o link.
    expect(screen.getByTestId("link-da-previa").textContent).toBe("https://exemplo.com/guia");
  });

  it("a mensagem se edita no próprio balão e vai à rota com palavra e link", async () => {
    m.mutate.mockImplementation((_corpo: unknown, op: { onSuccess: (r: unknown) => void }) =>
      op.onSuccess({ flow: { id: "f1" }, rule: { id: "r1" } }),
    );
    abrir();
    fireEvent.click(screen.getByText("Entregar material"));
    fireEvent.change(screen.getByLabelText("Mensagem"), { target: { value: "Toma o guia!" } });
    fireEvent.change(screen.getByLabelText("Link"), { target: { value: " https://exemplo.com/guia " } });
    fireEvent.click(screen.getByRole("button", { name: "Instalar" }));
    expect(m.mutate.mock.calls[0]?.[0]).toMatchObject({
      model_id: "palavra-entrega-material",
      palavras: "AGENTES",
      mensagem: "Toma o guia!",
      link: "https://exemplo.com/guia",
    });
    await waitFor(() => expect(m.push).toHaveBeenCalledWith("/app/ai/followups/f1"));
  });

  it("o modelo sem link (dúvida) não pede link e já pode instalar", () => {
    abrir();
    fireEvent.click(screen.getByText("Responder dúvida"));
    expect(screen.queryByLabelText("Link")).toBeNull();
    expect(screen.getByRole("button", { name: "Instalar" })).toBeEnabled();
  });

  it("Voltar devolve à galeria", () => {
    abrir();
    fireEvent.click(screen.getByText("Enviar link"));
    fireEvent.click(screen.getByRole("button", { name: "Voltar" }));
    expect(screen.getByText("Do zero")).toBeInTheDocument();
  });
});
