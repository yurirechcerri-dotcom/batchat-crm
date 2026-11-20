import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { WaitForm } from "@/app/app/ai/followups/[id]/_components/forms/WaitForm";
import { describeNodeConfig } from "@/app/app/ai/followups/[id]/_components/nodes/nodeVisuals";

afterEach(cleanup);
// O DOM de teste não implementa captura de ponteiro/rolagem usados pelo Radix.
beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
});

describe("esperas fixas sem arredondamento", () => {
  it.each([3000, 16000, 45000, 90001])("mostra %i ms em segundos e preserva ao mudar o horário", (duration_ms) => {
    const onChange = vi.fn();
    render(<WaitForm config={{ mode: "fixed", duration_ms }} onChange={onChange} />);
    expect(screen.getByLabelText("Duração (segundos)")).toHaveValue(duration_ms / 1000);
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("switch", { name: "Só terminar a espera em horário comercial" }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ duration_ms }));
    expect(describeNodeConfig("wait", { mode: "fixed", duration_ms }, (s) => s)).toBe(`${duration_ms / 1000} s`);
  });

  it("trocar unidade não altera a duração; editar segundos conserva os campos existentes", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<WaitForm config={{ mode: "fixed", duration_ms: 300000, immune_to_reply: true }} onChange={onChange} />);
    expect(screen.getByLabelText("Duração (minutos)")).toHaveValue(5);
    await user.click(screen.getByRole("combobox", { name: "Unidade da duração" }));
    await user.click(screen.getByRole("option", { name: "Segundos" }));
    expect(screen.getByLabelText("Duração (segundos)")).toHaveValue(300);
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Duração (segundos)"), { target: { value: "3" } });
    expect(onChange).toHaveBeenLastCalledWith({ mode: "fixed", duration_ms: 3000, immune_to_reply: true });
    onChange.mockClear();
    fireEvent.change(screen.getByLabelText("Duração (segundos)"), { target: { value: "0" } });
    expect(onChange).not.toHaveBeenCalled();
  });
});
