import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EditarNomeDoContato } from "./EditarNomeDoContato";

const mutate = vi.fn();
vi.mock("@/hooks/contacts/useUpdateContact", () => ({
  useUpdateContact: () => ({ mutate, isPending: false }),
}));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));

describe("EditarNomeDoContato", () => {
  it("lápis abre o campo com o nome salvo; Salvar grava só name e fecha", async () => {
    const aoSalvar = vi.fn();
    mutate.mockImplementation((_p, opts) => opts?.onSuccess?.());
    render(<EditarNomeDoContato contactId="c1" rotulo="Eduarda" nomeSalvo="Eduarda" aoSalvar={aoSalvar} />);
    await userEvent.click(screen.getByTestId("editar-nome-do-contato"));
    const campo = screen.getByLabelText("Nome do contato") as HTMLInputElement;
    expect(campo.value).toBe("Eduarda");
    await userEvent.clear(campo);
    await userEvent.type(campo, "  Eduarda Lima ");
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(mutate).toHaveBeenCalledWith({ name: "Eduarda Lima" }, expect.any(Object));
    expect(aoSalvar).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText("Nome do contato")).toBeNull();
  });

  it("contato sem nome salvo abre vazio e não grava nome em branco", async () => {
    mutate.mockClear();
    render(<EditarNomeDoContato contactId="c1" rotulo="Sem nome" nomeSalvo={null} />);
    await userEvent.click(screen.getByTestId("editar-nome-do-contato"));
    expect((screen.getByLabelText("Nome do contato") as HTMLInputElement).value).toBe("");
    expect((screen.getByRole("button", { name: "Salvar" }) as HTMLButtonElement).disabled).toBe(true);
    await userEvent.type(screen.getByLabelText("Nome do contato"), "   ");
    expect((screen.getByRole("button", { name: "Salvar" }) as HTMLButtonElement).disabled).toBe(true);
    expect(mutate).not.toHaveBeenCalled();
  });

  it("somente leitura desliga o lápis; Cancelar fecha sem gravar", async () => {
    mutate.mockClear();
    const { rerender } = render(<EditarNomeDoContato contactId="c1" rotulo="Ana" nomeSalvo="Ana" desabilitado />);
    expect((screen.getByTestId("editar-nome-do-contato") as HTMLButtonElement).disabled).toBe(true);
    rerender(<EditarNomeDoContato contactId="c1" rotulo="Ana" nomeSalvo="Ana" />);
    await userEvent.click(screen.getByTestId("editar-nome-do-contato"));
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByLabelText("Nome do contato")).toBeNull();
    expect(mutate).not.toHaveBeenCalled();
  });
});
