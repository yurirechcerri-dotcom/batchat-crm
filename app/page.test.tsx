import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const cena = vi.hoisted(() => ({
  usuario: null as { id: string } | null,
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((destino: string) => {
    throw new Error(`NEXT_REDIRECT:${destino}`);
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: cena.usuario } }) },
  }),
}));
vi.mock("@/lib/i18n/idiomaAnonimo", () => ({ idiomaDoVisitante: async () => "pt-BR" }));
vi.mock("@/lib/branding/saida", () => ({ marcaDaSaida: async () => ({ nome: "Marca da Revenda" }) }));

import HomePage from "./page";

async function montar() {
  return render(await HomePage());
}

beforeEach(() => {
  cena.usuario = null;
});

describe("/ — a página inicial pública", () => {
  // A verificação de um app que pede dados de conta Google abre o endereço
  // principal SEM entrar. Antes, `/` era só um redirect para o painel e o
  // revisor caía no login.
  it("sem sessão: mostra o nome da marca, o que o produto faz e os links legais", async () => {
    await montar();

    expect(screen.getByRole("heading", { level: 1, name: "Marca da Revenda" })).toBeInTheDocument();
    expect(screen.getByText(/Atendimento e vendas pelo WhatsApp/)).toBeInTheDocument();

    const politica = screen
      .getAllByRole("link", { name: "Política de Privacidade" })
      .map((a) => a.getAttribute("href"));
    expect(politica).toContain("/legal/privacy");
    expect(screen.getByRole("link", { name: "Termos de Uso" })).toHaveAttribute(
      "href",
      "/legal/terms",
    );
    for (const a of screen.getAllByRole("link", { name: "Entrar" })) expect(a).toHaveAttribute("href", "/login");
  });

  it("o nome vem da marca resolvida, não de texto fixo", async () => {
    await montar();
    expect(document.body.textContent).toContain("Marca da Revenda");
  });

  it("com sessão: segue direto para o painel, como sempre foi", async () => {
    cena.usuario = { id: "11111111-1111-4111-8111-111111111111" };
    await expect(montar()).rejects.toThrow("NEXT_REDIRECT:/app");
  });
});

describe("/ — motion da landing", () => {
  it("o script liga o motion e respeita reduzir movimento", async () => {
    const { RevelarAoRolar } = await import("./_revelar-ao-rolar");
    const original = window.matchMedia;
    const observe = vi.fn();
    class IO { observe = observe; unobserve() {} disconnect() {} }
    vi.stubGlobal("IntersectionObserver", IO);

    // reduzir movimento: nada é escondido
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as never;
    const a = render(<div className="bc-landing"><div className="bc-l-rev" /><RevelarAoRolar /></div>);
    expect(a.container.querySelector(".bc-landing")?.hasAttribute("data-bc-js")).toBe(false);
    a.unmount();

    // movimento normal: liga, põe o atraso em escada e observa os blocos
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as never;
    const b = render(<div className="bc-landing"><section><i className="bc-l-rev" /><i className="bc-l-rev" /></section><RevelarAoRolar /></div>);
    expect(b.container.querySelector(".bc-landing")?.hasAttribute("data-bc-js")).toBe(true);
    const revs = b.container.querySelectorAll<HTMLElement>(".bc-l-rev");
    expect(revs[0].style.getPropertyValue("--bc-l-d")).toBe("0ms");
    expect(revs[1].style.getPropertyValue("--bc-l-d")).toBe("70ms");
    expect(observe).toHaveBeenCalledTimes(2);
    b.unmount();
    expect(document.querySelector("[data-bc-js]")).toBeNull();

    window.matchMedia = original;
    vi.unstubAllGlobals();
  });

  it("a janela do produto entra no reveal", async () => {
    await montar();
    expect(document.querySelector(".bc-l-janela.bc-l-rev")).not.toBeNull();
  });
});
