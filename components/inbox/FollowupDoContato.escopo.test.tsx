import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FollowupDoContato } from "./FollowupDoContato";

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ apiClient: { get, post } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function resposta(contactId: string, id: string) {
  return { data: [{
    id, contact_id: contactId, pointer_id: "fluxo", status: "paused_manual",
    started_at: "2026-11-13T00:00:00Z", updated_at: "2026-11-13T00:00:00Z",
  }], meta: { pode_inscrever: true } };
}

describe("follow-up acompanha o contexto visível", () => {
  beforeEach(() => { vi.clearAllMocks(); post.mockResolvedValue({ data: {} }); });

  it.each(["contato", "organização", "conversa"])(
    "trocar %s remove as ações antigas enquanto a nova leitura está pendente",
    async (troca) => {
      let concluir!: (value: ReturnType<typeof resposta>) => void;
      let novaLeitura = false;
      const novoContato = troca === "contato" ? "contato-b" : "contato-a";
      get.mockImplementation((url: string) => {
        if (url.includes("followup-flows")) return Promise.resolve({ data: [] });
        if (novaLeitura) return new Promise((resolve) => { concluir = resolve; });
        return Promise.resolve(resposta("contato-a", "inscricao-a"));
      });
      const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
      const painel = (novo = false) => (
        <QueryClientProvider client={client}>
          <FollowupDoContato
            organizationId={novo && troca === "organização" ? "org-b" : "org-a"}
            contactId={novo ? novoContato : "contato-a"}
            conversationId={novo && troca === "conversa" ? "conversa-b" : "conversa-a"}
            podeParar somenteLeitura={false}
          />
        </QueryClientProvider>
      );
      const { rerender } = render(painel());
      await screen.findByRole("button", { name: "Retomar" });
      novaLeitura = true;
      rerender(painel(true));

      expect(screen.queryByRole("button", { name: "Retomar" })).toBeNull();
      expect(screen.queryByTestId("parar-followup")).toBeNull();
      expect(screen.queryByRole("link", { name: "Ver detalhes" })).toBeNull();
      expect(screen.getByTestId("inbox-followup-carregando")).toBeTruthy();
      expect(post).not.toHaveBeenCalled();

      await act(async () => { concluir(resposta(novoContato, "inscricao-b")); });
      await userEvent.click(await screen.findByRole("button", { name: "Retomar" }));
      await waitFor(() => expect(post).toHaveBeenCalledExactlyOnceWith(
        "/api/v1/ai/followups/enrollments/inscricao-b/resume", {},
      ));
    },
  );
});
