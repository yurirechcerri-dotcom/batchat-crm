import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CabecalhoDePagina } from "./CabecalhoDePagina";

describe("CabecalhoDePagina", () => {
  it("mostra título, apoio (com o texto inteiro no title) e as ações", () => {
    render(<CabecalhoDePagina titulo="Conexões" apoio="Por onde o negócio fala com o cliente." acoes={<button>Nova</button>} />);
    expect(screen.getByRole("heading", { level: 1, name: "Conexões" })).toBeTruthy();
    expect(screen.getByText("Por onde o negócio fala com o cliente.").getAttribute("title")).toBe("Por onde o negócio fala com o cliente.");
    expect(screen.getByRole("button", { name: "Nova" })).toBeTruthy();
  });

  it("sem apoio e sem ações, só o título", () => {
    const { container } = render(<CabecalhoDePagina titulo="Radar" />);
    expect(container.querySelector("p")).toBeNull();
    expect(container.querySelectorAll("button").length).toBe(0);
  });

  it("como=div evita header dentro de header", () => {
    const { container } = render(<header><CabecalhoDePagina como="div" titulo="Tarefas" /></header>);
    expect(container.querySelectorAll("header").length).toBe(1);
  });

  it("título entre 28 e 36 px no padrão do DESIGN.md", () => {
    render(<CabecalhoDePagina titulo="Agenda" />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.className).toContain("text-[1.75rem]");
    expect(h1.className).toContain("sm:text-4xl");
  });
});
