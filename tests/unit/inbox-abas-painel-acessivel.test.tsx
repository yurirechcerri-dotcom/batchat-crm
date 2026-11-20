import { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InboxFilters, type InboxFiltersValue } from "@/components/inbox/InboxFilters";

vi.mock("@/hooks/auth/AuthProvider", () => ({
  useAuth: () => ({ activeOrg: { orgId: "org-1", role: "manager", visibility_mode: "all" } }),
}));
vi.mock("@/hooks/channels/useChannelSessions", () => ({
  useChannelSessions: () => ({ data: [] }), channelLabel: () => "canal",
}));
vi.mock("@/hooks/inbox/useConversationTags", () => ({
  useConversationTagVocabulary: () => ({ data: [] }),
}));
vi.mock("@/hooks/contacts/useContactTagVocabulary", () => ({
  useContactTagVocabulary: () => ({ data: [] }),
}));
vi.mock("@/hooks/inbox/useConversationCounts", () => ({
  useConversationCounts: () => ({ data: {} }),
}));

const PANEL = "lista-de-conversas-do-teste";
function Tela() {
  const [value, onChange] = useState<InboxFiltersValue>({
    tab: "unassigned", search: "", onlyUnread: false,
  });
  return <>
    <InboxFilters value={value} onChange={onChange} tabPanelId={PANEL} />
    <div id={PANEL} role="tabpanel" aria-labelledby={`${PANEL}-tab-${value.tab}`}>
      Lista filtrada
    </div>
  </>;
}
afterEach(cleanup);

describe("abas da Inbox controlam a lista real, fora do componente de filtros", () => {
  it("cada aba aponta para o painel existente e a aba selecionada dá nome ao painel", () => {
    render(<Tela />);
    const panel = screen.getByRole("tabpanel", { name: "Fila" });
    for (const tab of screen.getAllByRole("tab")) {
      expect(document.getElementById(tab.getAttribute("aria-controls")!)).toBe(panel);
    }
    expect(document.getElementById(panel.getAttribute("aria-labelledby")!))
      .toBe(screen.getByRole("tab", { name: "Fila", selected: true }));
  });

  it("trocar o filtro atualiza a seleção sem trocar o painel controlado", async () => {
    const user = userEvent.setup();
    render(<Tela />);
    const panel = screen.getByRole("tabpanel", { name: "Fila" });
    await user.click(screen.getByRole("tab", { name: "Todas" }));
    expect(screen.getByRole("tabpanel", { name: "Todas" })).toBe(panel);
    expect(screen.getByRole("tab", { name: "Todas", selected: true }))
      .toHaveAttribute("aria-controls", PANEL);
  });
});
