import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { IdiomaProvider } from "@/lib/i18n/IdiomaProvider";
const api = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ apiClient: api }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { VozDoAgente } from "@/app/app/ai/agents/[id]/_components/VozDoAgente";
const ID = "d84300b9f2bd453caebcca83639daaa7";
beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
});
beforeEach(() => { vi.clearAllMocks(); api.patch.mockResolvedValue({}); });
function montar(inicial?: string) {
  render(<IdiomaProvider locale="pt-BR"><VozDoAgente agentId="agente-1" inicial={inicial} /></IdiomaProvider>);
}
describe("voz Fish por agente", () => {
  it("oferece catálogo ao vivo mesmo com models_available vazio", async () => {
    api.get.mockResolvedValue({ data: { provider: "fish", voiceId: null, vozesDisponiveis: [], catalogo: [{ id: ID }] } });
    montar();
    const user = userEvent.setup();
    await user.click(await screen.findByTestId("voz-do-agente"));
    await user.click(await screen.findByRole("option", { name: ID }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/api/v1/ai/agents/agente-1", { config: { voz_voice_id: ID } }));
  });

  it("catálogo vazio permite limpar a voz antiga e herdar Fish da organização", async () => {
    api.get.mockResolvedValue({ data: { provider: "fish", voiceId: ID, vozesDisponiveis: [], catalogo: [] } });
    montar("voz-antiga-elevenlabs");
    const user = userEvent.setup();
    const combo = await screen.findByTestId("voz-do-agente");
    expect(screen.getByRole("alert")).toHaveTextContent(/não tem o formato Fish/);
    await user.click(combo);
    await user.click(await screen.findByRole("option", { name: `Voz da organização (${ID})` }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/api/v1/ai/agents/agente-1", { config: { voz_voice_id: null } }));
  });
});
