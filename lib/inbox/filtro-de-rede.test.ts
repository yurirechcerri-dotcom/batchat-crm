import { describe, expect, it } from "vitest";

import { comAba, type InboxFiltersValue } from "@/components/inbox/InboxFilters";
import { julgarAtualizacao } from "@/lib/inbox/atualizacao-da-lista";
import { filtrosAuxiliaresAtivos } from "@/lib/inbox/filtros-ativos";

const base: InboxFiltersValue = { tab: "all", search: "", onlyUnread: false, channel: "instagram" };

describe("filtro por rede (menu da aba Todas)", () => {
  it("fica ao trocar para a própria aba Todas", () => {
    expect(comAba(base, "all").channel).toBe("instagram");
  });

  it("some ao sair da aba Todas, para a lista não ficar recortada sem aviso", () => {
    expect(comAba(base, "unassigned").channel).toBeUndefined();
    expect(comAba(base, "mine").channel).toBeUndefined();
  });

  it("a conversa que muda de rede sai da lista filtrada", () => {
    const anterior = { id: "c1", status: "open", channel: "instagram" } as never;
    expect(julgarAtualizacao(anterior, { channel: "whatsapp" }, { channel: "instagram" } as never)).toBe("sai");
    expect(julgarAtualizacao(anterior, { status: "open" }, { channel: "instagram" } as never)).not.toBe("sai");
  });

  it("conta como filtro ativo", () => {
    expect(filtrosAuxiliaresAtivos({ channel: "instagram" } as never)).toContain("Canal");
  });
});
