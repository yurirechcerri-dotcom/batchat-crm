import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const route = vi.hoisted(() => ({ pathname: "/login" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("react-hotkeys-hook", () => ({ useHotkeys: () => {} }));
vi.mock("@/lib/i18n/IdiomaProvider", () => ({ useT: () => (s: string) => s }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.resetModules();
  route.pathname = "/login";
  localStorage.clear();
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

async function renderFrame(name = "BatChat") {
  const { ThemeProvider } = await import("@/lib/theme");
  const { PublicBrandFrame } = await import("@/components/auth/PublicBrandFrame");
  act(() => root.render(
    <ThemeProvider>
      <PublicBrandFrame name={name}>
        <form><input aria-label="Email" defaultValue="teste@example.invalid" /></form>
      </PublicBrandFrame>
    </ThemeProvider>,
  ));
}

describe("aparência na entrada BatChat", () => {
  it("troca pelo controle real, grava a preferência e preserva o formulário", async () => {
    await renderFrame();
    const field = container.querySelector("input")!;
    const button = container.querySelector<HTMLButtonElement>('button[aria-label^="Tema:"]');
    expect(button, "o visitante precisa alcançar a preferência antes de entrar").not.toBeNull();
    act(() => button!.click()); // system -> light
    act(() => button!.click()); // light -> dark
    expect(document.documentElement.dataset.theme).toBe("dark");
    const { STORAGE_KEY } = await import("@/lib/theme");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("dark");
    expect(container.querySelector("input")).toBe(field);
    expect(field.value).toBe("teste@example.invalid");
    expect(container.querySelector("form")!.contains(button)).toBe(false);
  });

  it.each(["/login/forgot", "/login/mfa", "/signup"])("preserva a casca de %s", async (path) => {
    route.pathname = path;
    await renderFrame();
    expect(container.querySelector('[data-testid="batchat-login-frame"]')).toBeNull();
    expect(container.querySelector('button[aria-label^="Tema:"]')).toBeNull();
    expect(container.querySelector("input")).not.toBeNull();
  });

  it("não injeta a apresentação em outra marca", async () => {
    await renderFrame("Outra empresa");
    expect(container.querySelector('button[aria-label^="Tema:"]')).toBeNull();
    expect(container.querySelector("input")).not.toBeNull();
  });
});

describe("logo única no login do BatChat", () => {
  it("a moldura esconde a logo do formulário (a da apresentação já aparece) e o layout a marca", async () => {
    const { readFileSync } = await import("node:fs");
    const css = readFileSync("components/auth/PublicBrandFrame.module.css", "utf8");
    expect(css).toMatch(/\.formContent :global\(\[data-fachada-logo\]\)\s*\{\s*display:\s*none;/);
    const layout = readFileSync("app/(public)/layout.tsx", "utf8");
    expect(layout).toContain("data-fachada-logo");
  });
});
