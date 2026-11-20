import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChatCircle } from "@phosphor-icons/react";
import { EmptyState } from "./EmptyState";
import { EmptyFilterResults, EmptyAgenda } from "./variants";

describe("EmptyState com mascote", () => {
  it("mostra o mascote com o ícone no distintivo, título e texto", () => {
    render(<EmptyState icon={ChatCircle} headline="Sem conversas" subcopy="Novas mensagens aparecem aqui." />);
    expect(screen.getByTestId("mascote-vazio")).toBeTruthy();
    expect(screen.getByTestId("mascote-distintivo").querySelector("svg")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Sem conversas" })).toBeTruthy();
    expect(screen.getByTestId("mascote-vazio").getAttribute("data-humor")).toBe("padrao");
  });

  it("variantes escolhem o humor do mascote", () => {
    const { unmount } = render(<EmptyFilterResults />);
    expect(screen.getByTestId("mascote-vazio").getAttribute("data-humor")).toBe("procurando");
    unmount();
    render(<EmptyAgenda />);
    expect(screen.getByTestId("mascote-vazio").getAttribute("data-humor")).toBe("dormindo");
  });

  it("botões de ação continuam aparecendo", () => {
    render(<EmptyState icon={ChatCircle} headline="Vazio" primary={{ label: "Criar", href: "/x" }} />);
    expect(screen.getByRole("link", { name: "Criar" }).getAttribute("href")).toBe("/x");
  });
});
