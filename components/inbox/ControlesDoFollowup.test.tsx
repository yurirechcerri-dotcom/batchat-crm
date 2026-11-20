import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ControlesDoFollowup } from "./ControlesDoFollowup";

const { post, showError } = vi.hoisted(() => ({ post: vi.fn(), showError: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ apiClient: { post } }));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: showError }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

function montar(overrides: Partial<React.ComponentProps<typeof ControlesDoFollowup>> = {}) {
  const aoAlterar = vi.fn();
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const props = {
    enrollmentId: "enrollment-do-contato", status: "active", podeEscrever: true,
    bloqueado: false, ocupado: false, aoAlterar, ...overrides,
  };
  render(<QueryClientProvider client={client}><ControlesDoFollowup {...props} /></QueryClientProvider>);
  return { aoAlterar, user: userEvent.setup() };
}

describe("Controle do fluxo na conversa", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it.each([
    ["active", "Pausar", "pause"],
    ["waiting_reply", "Pausar", "pause"],
    ["paused_manual", "Retomar", "resume"],
  ])("%s usa a intervenção canônica e só atualiza após sucesso", async (status, label, action) => {
    let concluir!: (value: unknown) => void;
    post.mockImplementation(() => new Promise((resolve) => { concluir = resolve; }));
    const { user, aoAlterar } = montar({ status });
    await user.click(screen.getByRole("button", { name: label }));
    expect(post).toHaveBeenCalledExactlyOnceWith(
      `/api/v1/ai/followups/enrollments/enrollment-do-contato/${action}`, {},
    );
    expect(aoAlterar).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: label })).toBeDisabled();
    concluir({ data: { id: "enrollment-do-contato", status: "paused_manual", next_eval_at: null } });
    await waitFor(() => expect(aoAlterar).toHaveBeenCalledOnce());
  });

  it.each(["paused_handoff", "cancelled", "completed", "dormente"])(
    "%s não ganha retomada manual que mudaria sua semântica", (status) => {
      montar({ status });
      expect(screen.queryByRole("button", { name: /^(Pausar|Retomar)$/ })).toBeNull();
      expect(screen.getByRole("link", { name: "Ver detalhes" })).toHaveAttribute(
        "href", "/app/ai/followups/enrollments/enrollment-do-contato",
      );
    },
  );

  it.each([{ podeEscrever: false }, { bloqueado: true }])("respeita o veto %j", (veto) => {
    montar({ status: "paused_manual", ...veto });
    expect(screen.queryByRole("button", { name: "Retomar" })).toBeNull();
    expect(post).not.toHaveBeenCalled();
  });

  it("recusa do servidor permanece visível, sem declarar mudança", async () => {
    const failure = new Error("motor ocupado");
    post.mockRejectedValue(failure);
    const { user, aoAlterar } = montar();
    await user.click(screen.getByRole("button", { name: "Pausar" }));
    await waitFor(() => expect(showError).toHaveBeenCalledWith(failure));
    expect(aoAlterar).not.toHaveBeenCalled();
  });
});
