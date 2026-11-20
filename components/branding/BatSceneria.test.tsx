import { describe, expect, it } from "vitest";
import { createEvent, fireEvent, render, screen } from "@testing-library/react";
import { CenaVazia } from "./BatSceneria";
import { LogoInterativa } from "./LogoInterativa";
import { AvatarComAnel } from "@/components/inbox/AvatarComAnel";

describe("identidade visual do BatChat", () => {
  it("CenaVazia mostra marca, título e texto, e as figuras não são lidas por leitor de tela", () => {
    const { container } = render(<CenaVazia titulo="Selecione uma conversa" texto="Ou navegue com J e K" />);
    expect(screen.getByText("Selecione uma conversa")).toBeTruthy();
    expect(screen.getByText("BatChat")).toBeTruthy();
    expect(container.querySelectorAll("svg[aria-hidden='true']").length).toBeGreaterThanOrEqual(3);
  });

  it("LogoInterativa inclina com o mouse e volta ao centro ao sair; toque não inclina", () => {
    window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
    render(<LogoInterativa />);
    const area = screen.getByTestId("logo-interativa");
    const alvo = area.firstElementChild as HTMLElement;
    alvo.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200, x: 0, y: 0, toJSON() {} }) as DOMRect;
    const toque = createEvent.pointerMove(area, { clientX: 200, clientY: 0 });
    Object.defineProperty(toque, "pointerType", { value: "touch" });
    fireEvent(area, toque);
    expect(alvo.style.transform).toBe("");
    const mouse = createEvent.pointerMove(area, { clientX: 200, clientY: 0 });
    Object.defineProperty(mouse, "pointerType", { value: "mouse" });
    Object.defineProperty(mouse, "clientX", { value: 200 });
    Object.defineProperty(mouse, "clientY", { value: 0 });
    fireEvent(area, mouse);
    expect(alvo.style.transform).toContain("rotateY(14.00deg)");
    expect(alvo.style.transform).toContain("rotateX(14.00deg)");
    fireEvent.pointerLeave(area);
    expect(alvo.style.transform).toContain("rotateY(0deg)");
  });

  it("AvatarComAnel mostra as iniciais, usa a reserva sem nome e tem anel de marca", () => {
    const { rerender } = render(<AvatarComAnel nome="Ana Lima" />);
    expect(screen.getByTestId("avatar-com-anel").textContent).toBe("AL");
    expect(screen.getByTestId("avatar-com-anel").className).toContain("border-accent");
    rerender(<AvatarComAnel nome={null} reserva="zz" />);
    expect(screen.getByTestId("avatar-com-anel").textContent).toBe("ZZ");
  });
});
