/** A automação substitui o ícone de geração; sugestões existentes continuam revisáveis. */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), toastSuccess: vi.fn() }));

// A borda de rede: é o que a consulta compartilhada do rascunho lê e o que o
// botão de ícone escreve. O resto do caminho é real.
vi.mock("@/lib/api/client", () => ({ apiClient: { get: deps.get, post: deps.post } }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (texto: string) => texto }));
vi.mock("sonner", () => ({
  toast: { success: deps.toastSuccess, error: vi.fn(), warning: vi.fn() },
}));

// Filhos irrelevantes para a faixa: mesma lista de placeholders dos outros
// testes do compositor.
vi.mock("@/components/inbox/composer/TemplateMenu", () => ({
  resolveSlash: () => ({ open: false, query: "" }),
  TemplateMenu: () => null,
}));
vi.mock("@/components/inbox/composer/MentionMenu", () => ({
  resolverMencao: () => null,
  opcoesDeMencao: () => [],
  MentionMenu: () => null,
}));
vi.mock("@/components/inbox/composer/AttachMenu", () => ({ AttachMenu: () => null }));
vi.mock("@/components/inbox/composer/AttachmentPreviewDialog", () => ({
  AttachmentPreviewDialog: () => null,
}));
vi.mock("@/components/inbox/composer/ContactPickerDialog", () => ({
  ContactPickerDialog: () => null,
}));
vi.mock("@/components/inbox/composer/AudioRecorder", () => ({ AudioRecorder: () => null }));
vi.mock("@/components/inbox/composer/EmojiButton", () => ({ EmojiButton: () => null }));
vi.mock("@/components/inbox/composer/BarraDeRecursos", () => ({ BarraDeRecursos: () => null }));
vi.mock("@/hooks/inbox/useSendMessage", () => ({
  useSendMessage: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/inbox/useCreateNote", () => ({
  useCreateNote: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/inbox/useUploadMedia", () => ({
  useUploadMedia: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/inbox/useMessageTemplates", () => ({
  useMessageTemplates: () => ({ data: [], isLoading: false }),
  // Sem grupo (#3245): a barra e o slash-menu são os de antes dos grupos, que é
  // o caminho que estes casos medem.
  useGruposDeRespostas: () => ({ data: [] }),
}));
vi.mock("@/hooks/inbox/useAssignableMembers", () => ({
  useAssignableMembers: () => ({ data: [] }),
}));
vi.mock("@/lib/inbox/clipboard-image", () => ({ imagemDoClipboard: () => null }));
vi.mock("@/lib/notifications/mentions", () => ({
  embutirMencoes: (body: string) => body,
  podarMencoesDaEdicao: vi.fn((_antes: string, _depois: string, m: unknown) => m),
  podarMencoes: (_texto: string, m: unknown) => m,
  resolverMencao: () => null,
}));
vi.mock("@/lib/messaging/contact-card", () => ({ resolveSharedContact: vi.fn() }));

import { Composer } from "./Composer";

/** Um rascunho como o servidor devolve — só os campos que a tela lê. */
const rascunho = (extra: Record<string, unknown> = {}) => ({
  id: "d1",
  revision: "1",
  status: "pending",
  original_body: "Oi, tudo bem?",
  edited_body: null,
  error_code: null,
  proposals: [],
  ...extra,
});

function comRascunhos(drafts: unknown[]) {
  deps.get.mockResolvedValue({ data: { drafts } });
}

function renderComposer(props: Partial<ComponentProps<typeof Composer>> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <Composer conversationId="conv-1" contactName="Rafael" automationControl={<button>Automação</button>} {...props} />
    </QueryClientProvider>,
  );
}

/** O bloco, pelo rótulo que a própria issue cita. */
const bloco = () => screen.queryByLabelText("Assistência do agente");
/** O botão de ícone do compositor (e o de texto do bloco, quando ele existe). */
const botoesDeSugerir = () => screen.queryAllByRole("button", { name: "Sugerir resposta" });

beforeEach(() => {
  deps.get.mockReset();
  deps.post.mockReset();
  deps.toastSuccess.mockReset();
});

describe("a faixa da assistência só existe com rascunho (issue #3027)", () => {
  it("sem rascunho: mostra Automação sem oferecer geração de resposta", async () => {
    comRascunhos([]);
    renderComposer();

    await screen.findByRole("button", { name: "Automação" });

    expect(bloco(), "o bloco 'Assistência do agente' está ocupando faixa sem rascunho").toBeNull();
    expect(screen.queryByText("Assistência do agente")).toBeNull();
    expect(screen.queryByRole("button", { name: "Aprovar e enviar" })).toBeNull();
    expect(botoesDeSugerir()).toHaveLength(0);
  });

  it("CONTROLE: com rascunho para revisar, o bloco volta com o texto e as ações", async () => {
    comRascunhos([rascunho({ status: "pending" })]);
    renderComposer();

    expect(await screen.findByText("Sugestão para revisar")).toBeTruthy();
    expect(bloco()).toBeTruthy();
    expect(screen.getByLabelText("Resposta sugerida")).toHaveValue("Oi, tudo bem?");
    expect(screen.getByRole("button", { name: "Aprovar e enviar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Rejeitar" })).toBeTruthy();
    // Um só: o do bloco — o ícone do compositor saiu de cena.
    expect(botoesDeSugerir()).toHaveLength(1);
  });

  it("CONTROLE: rascunho preparando e rascunho aprovado também mantêm o bloco", async () => {
    comRascunhos([rascunho({ status: "generating", original_body: null })]);
    const primeira = renderComposer();

    expect(await screen.findByText("Preparando sugestão…")).toBeTruthy();
    expect(bloco()).toBeTruthy();
    primeira.unmount();

    comRascunhos([rascunho({ status: "approved" })]);
    renderComposer();

    expect(await screen.findByText("Resposta aprovada: aguardando envio")).toBeTruthy();
    expect(bloco()).toBeTruthy();
    expect(botoesDeSugerir()).toHaveLength(1);
  });

  it("enviado ou descartado, permanece Automação sem ícone de sugestão", async () => {
    for (const status of ["sent", "dismissed", "stale"]) {
      comRascunhos([rascunho({ status })]);
      const { unmount } = renderComposer();

      await screen.findByRole("button", { name: "Automação" });
      expect(bloco(), `com status ${status} o bloco continuou na tela`).toBeNull();
      expect(screen.queryByText("Assistência do agente")).toBeNull();
      expect(botoesDeSugerir()).toHaveLength(0);
      unmount();
    }
  });

  it("CONTROLE: em modo NOTA não há botão de sugestão nem bloco", async () => {
    comRascunhos([rascunho()]);
    renderComposer({ initialMode: "note" });

    // Em nota o compositor não oferece sugestão de resposta: nem bloco, nem
    // ícone, e a consulta nem sai (o `enabled` do hook segue o modo).
    expect(bloco()).toBeNull();
    expect(botoesDeSugerir()).toHaveLength(0);
    expect(deps.get).not.toHaveBeenCalled();

    await userEvent.click(screen.getByText("Responder"));
    // Voltando para resposta, com um rascunho no servidor, o bloco aparece.
    expect(await screen.findByText("Sugestão para revisar")).toBeTruthy();
    expect(bloco()).toBeTruthy();
  });

  it("⭐ compositor bloqueado não consulta rascunho (só leitura recebe 403 no GET)", async () => {
    comRascunhos([rascunho()]);
    renderComposer({ blockedReason: "Acompanhamento somente leitura" });

    expect(await screen.findByText("Acompanhamento somente leitura")).toBeTruthy();
    // Antes do #3027 a consulta morava no painel, que o aviso de bloqueio nem
    // deixava montar. Subindo para o compositor, ela não pode sair por conta
    // própria: o suporte somente leitura recebia 403 a cada 4s
    // (`tests/e2e/suporte-temporario.spec.ts`, `unexpectedDenials`).
    expect(deps.get).not.toHaveBeenCalled();
  });

  it("o controle de automação permanece ao lado de uma sugestão existente", async () => {
    comRascunhos([rascunho()]);
    renderComposer();
    await screen.findByText("Sugestão para revisar");
    expect(screen.getByRole("button", { name: "Automação" })).toBeTruthy();
    expect(deps.post).not.toHaveBeenCalled();
  });

  it("⭐ a confirmação da rejeição sobrevive ao bloco que sai (toast)", async () => {
    comRascunhos([rascunho({ status: "pending" })]);
    deps.post.mockResolvedValue({ data: {} });
    renderComposer();

    await screen.findByText("Sugestão para revisar");
    // O servidor passa a responder com a sugestão DESCARTADA, como no fluxo real.
    comRascunhos([rascunho({ status: "dismissed" })]);
    await userEvent.click(screen.getByRole("button", { name: "Rejeitar" }));

    await waitFor(() =>
      expect(deps.toastSuccess).toHaveBeenCalledWith(
        "Sugestão rejeitada. O feedback será usado na próxima sugestão.",
      ),
    );
    await screen.findByRole("button", { name: "Automação" });
    await waitFor(() => expect(bloco()).toBeNull());
    expect(botoesDeSugerir()).toHaveLength(0);
    // A decisão foi o MESMO POST do bloco, com a revisão e o feedback — o
    // caminho não ganhou uma segunda rota ao trocar de superfície.
    expect(deps.post).toHaveBeenCalledWith("/api/v1/ai/replies/d1", {
      action: "reject",
      revision: "1",
      body: "Oi, tudo bem?",
      feedback: "",
    });
  });
});
