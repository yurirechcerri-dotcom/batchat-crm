import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/followup/useModelosAprovadosDoFluxo", () => ({
  useModelosAprovadosDoFluxo: () => ({ isSuccess: true, data: [] }),
}));
vi.mock("@/hooks/webhooks/useWebhookSources", () => ({
  usePipelines: () => ({ data: { data: [] } }),
}));

import { ActionForm } from "@/app/app/ai/followups/[id]/_components/forms/ActionForm";
import { IdiomaProvider } from "@/lib/i18n/IdiomaProvider";

afterEach(cleanup);

describe("editor nativo: legenda opcional", () => {
  it("apaga legenda, conserva mídia e recusa apagar também a mídia", () => {
    const onChange = vi.fn();
    const media_url = "https://media.example/foto.png";
    render(<IdiomaProvider locale="pt-BR">
      <ActionForm config={{ mode: "text", body: "Legenda", media_url }} onChange={onChange} />
    </IdiomaProvider>);
    fireEvent.change(screen.getByLabelText("Texto enviado ao contato"), { target: { value: "" } });
    expect(onChange).toHaveBeenLastCalledWith({ mode: "text", body: "", media_url });
    onChange.mockClear();
    fireEvent.change(screen.getByLabelText("Link da mídia"), { target: { value: "" } });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText("Escreva uma mensagem ou adicione uma mídia. A legenda é opcional.")).toBeTruthy();
  });
});
