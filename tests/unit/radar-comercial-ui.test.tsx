// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RadarComercial } from "@/app/app/radar/_components/RadarComercial";
import { apiClient } from "@/lib/api/client";
vi.mock("@/lib/api/client", () => ({ apiClient: { get: vi.fn(), patch: vi.fn() } }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.PropsWithChildren<React.AnchorHTMLAttributes<HTMLAnchorElement>>) => <a {...props}>{children}</a> }));
const item = { id: "signal", conversation_id: "conversation", message_id: "message", category: "compra", confidence: "alta", excerpt: "Quero comprar", contact_name: "Pessoa de teste", created_at: "2026-11-14T12:00:00Z", pause_status: "paused", notify_status: "sent", error_code: null };
function mount() { return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><RadarComercial orgId="org" /></QueryClientProvider>); }
beforeEach(() => { vi.clearAllMocks(); vi.mocked(apiClient.patch).mockResolvedValue({}); });
describe("Radar comercial", () => {
  it("mostra trecho, pausa confirmada, link e resolução sem retomar", async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { config: { enabled: true, auto_pause: true, notify_sexta: true }, canManage: true, items: [item] } });
    mount();
    expect(await screen.findByText("“Quero comprar”")).toBeTruthy();
    expect(screen.getByText("Pausado para você atender")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Abrir conversa/ }).getAttribute("href")).toBe("/app/inbox?id=conversation");
    fireEvent.click(screen.getByRole("button", { name: /Já cuidei/ }));
    await waitFor(() => expect(apiClient.patch).toHaveBeenCalledWith("/api/v1/radar/comercial", { resolve: "signal" }));
  });
  it("não apresenta falha ou pendência como entregue", async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { config: { enabled: true }, canManage: false, items: [{ ...item, pause_status: "pending", notify_status: "unknown" }] } });
    mount();
    expect(await screen.findByText(/Pausa pendente/)).toBeTruthy();
    expect(screen.getByText(/Entrega do aviso incerta/)).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Identificar sinais comerciais" }).hasAttribute("disabled")).toBe(true);
  });
});
