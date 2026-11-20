import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ accept: vi.fn(), toast: vi.fn() }));
vi.mock("@/app/actions/onboarding/acceptWelcome", () => ({ acceptWelcome: f.accept }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (text: string) => text }));
vi.mock("sonner", () => ({ toast: { error: f.toast } }));
import { WelcomeForm } from "@/app/onboarding/welcome/_form";

beforeEach(() => vi.clearAllMocks());

const ORG = "11111111-1111-4111-8111-111111111111";

/** O quiz é de cliques: marca os três grupos e o aceite. */
function responderQuiz() {
  fireEvent.click(screen.getByRole("checkbox", { name: "WhatsApp" }));
  fireEvent.click(screen.getByRole("radio", { name: /Responder uma palavra-chave/ }));
  fireEvent.click(screen.getByRole("radio", { name: "Só eu" }));
  fireEvent.click(screen.getByLabelText(/Li e aceito os/));
}

it("só libera o Continuar com o quiz inteiro respondido e os termos aceitos", () => {
  render(<WelcomeForm orgId={ORG} defaultOrgName="Empresa A" />);
  const continuar = screen.getByRole("button", { name: "Continuar" });
  expect(continuar).toBeDisabled();
  responderQuiz();
  expect(continuar).toBeEnabled();
});

it("envia as respostas do quiz e a org da aba, sem exigir nenhum texto", async () => {
  f.accept.mockResolvedValue({ ok: true });
  const { container } = render(<WelcomeForm orgId={ORG} defaultOrgName="" />);
  responderQuiz();
  fireEvent.click(screen.getByRole("checkbox", { name: "Instagram" }));
  fireEvent.submit(container.querySelector("form")!);
  await waitFor(() => expect(f.accept).toHaveBeenCalled());
  const enviado = f.accept.mock.calls[0]?.[0] as FormData;
  expect(enviado.get("organization_id")).toBe(ORG);
  expect(enviado.getAll("canais")).toEqual(["whatsapp", "instagram"]);
  expect(enviado.get("objetivo")).toBe("palavra_chave");
  expect(enviado.get("equipe")).toBe("sozinho");
  // O nome do negócio é opcional: vazio vai vazio e o servidor mantém o atual.
  expect(enviado.get("display_name")).toBe("");
});

it("explica organization_changed sem descartar o que a pessoa marcou", async () => {
  f.accept.mockResolvedValue({ ok: false, error: "organization_changed" });
  const { container } = render(<WelcomeForm orgId={ORG} defaultOrgName="Empresa A" />);
  responderQuiz();
  fireEvent.submit(container.querySelector("form")!);
  await waitFor(() =>
    expect(f.toast).toHaveBeenCalledWith("A empresa ativa mudou. Recarregue a página antes de continuar."),
  );
  expect(screen.getByRole("checkbox", { name: "WhatsApp" })).toHaveAttribute("aria-checked", "true");
  expect(screen.getByLabelText(/Nome do negócio/)).toHaveValue("Empresa A");
});
