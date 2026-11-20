/**
 * O COMEÇO ENCURTADO: conta criada → mini tour → setup de poucos cliques.
 *
 * Mede as três peças novas que não passam por Server Component: o contrato do
 * quiz (o que o servidor aceita), o tour (termina e pula carimbando
 * `concluirTour` antes de ir ao setup) e o resumo da lateral.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ concluir: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("@/app/actions/onboarding/concluirTour", () => ({ concluirTour: m.concluir }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: m.replace, refresh: m.refresh }),
  usePathname: () => "/onboarding/welcome",
}));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (text: string) => text }));

import { TourDoApp } from "@/components/onboarding/TourDoApp";
import { ResumoDoQuiz } from "@/app/onboarding/_components/ResumoDoQuiz";
import { quizSchema } from "@/lib/schemas/onboarding";

beforeEach(() => {
  vi.clearAllMocks();
  m.concluir.mockResolvedValue({ ok: true });
});

describe("quiz", () => {
  it("aceita as três respostas de clique", () => {
    expect(
      quizSchema.safeParse({ canais: ["whatsapp", "instagram"], objetivo: "palavra_chave", equipe: "sozinho" }).success,
    ).toBe(true);
  });

  it("recusa quiz incompleto ou com valor inventado — o passo segue sem quiz, nunca com lixo", () => {
    expect(quizSchema.safeParse({ canais: [], objetivo: "palavra_chave", equipe: "sozinho" }).success).toBe(false);
    expect(quizSchema.safeParse({ canais: ["whatsapp"], objetivo: "x", equipe: "sozinho" }).success).toBe(false);
    expect(quizSchema.safeParse({ canais: ["telegram"], objetivo: "recuperar", equipe: "equipe" }).success).toBe(false);
  });
});

describe("mini tour", () => {
  it("percorre as cinco paradas e, no fim, carimba o tour como visto e vai ao setup", async () => {
    render(<TourDoApp />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("1 / 5")).toBeInTheDocument();
    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByRole("button", { name: "Próximo" }));
    expect(screen.getByText("5 / 5")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Começar a configuração" }));
    await waitFor(() => expect(m.concluir).toHaveBeenCalledWith({ pulou: false }));
    await waitFor(() => expect(m.replace).toHaveBeenCalledWith("/onboarding"));
  });

  it("Pular tour (e Esc) carimba como pulado e também vai ao setup", async () => {
    render(<TourDoApp />);
    fireEvent.click(screen.getByRole("button", { name: "Pular tour" }));
    await waitFor(() => expect(m.concluir).toHaveBeenCalledWith({ pulou: true }));
    await waitFor(() => expect(m.replace).toHaveBeenCalledWith("/onboarding"));
  });

  it("Esc pula o tour", async () => {
    render(<TourDoApp />);
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(m.concluir).toHaveBeenCalledWith({ pulou: true }));
  });
});

describe("resumo do quiz", () => {
  it("devolve as respostas da pessoa na lateral", () => {
    render(<ResumoDoQuiz quiz={{ canais: ["whatsapp", "instagram"], objetivo: "palavra_chave", equipe: "equipe" }} />);
    expect(screen.getByText("WhatsApp, Instagram")).toBeInTheDocument();
    expect(screen.getByText("Responder palavra-chave")).toBeInTheDocument();
    expect(screen.getByText("Eu e minha equipe")).toBeInTheDocument();
  });

  it("sem quiz não inventa resposta", () => {
    const { container } = render(<ResumoDoQuiz quiz={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });
});
