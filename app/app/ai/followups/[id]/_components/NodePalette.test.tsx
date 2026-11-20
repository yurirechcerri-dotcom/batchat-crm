/**
 * A paleta oferece só as caixas que o motor da superfície executa — na prova
 * prática do #1130, a paleta do roteiro oferecia seis caixas (Aguardar,
 * Condição, Classificar…) que o motor recusava em silêncio.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { NodePalette } from "./NodePalette";

const tipos = () =>
  screen.getAllByRole("button").map((b) => b.getAttribute("data-testid")?.replace("palette-add-", ""));

describe("NodePalette por superfície", () => {
  it("roteiro: Início, Pergunta, Skill e Fim", () => {
    render(<NodePalette onAdd={() => {}} surface="atendimento" />);
    expect(tipos()).toEqual(["trigger", "collect", "skill", "end"]);
  });

  it("follow-up: sem Pergunta nem Skill", () => {
    render(<NodePalette onAdd={() => {}} />);
    expect(tipos()).not.toContain("collect");
    expect(tipos()).not.toContain("skill");
    expect(tipos()).toContain("wait");
  });

  it("a busca filtra os nós pelo rótulo e volta tudo ao limpar", () => {
    render(<NodePalette onAdd={() => {}} />);
    const quantos = () => screen.queryAllByRole("button").length;
    const todos = quantos();
    fireEvent.change(screen.getByLabelText("Buscar nó"), { target: { value: "zzzz-nao-existe" } });
    expect(quantos()).toBe(0);
    fireEvent.change(screen.getByLabelText("Buscar nó"), { target: { value: "" } });
    expect(quantos()).toBe(todos);
  });
});
