import { describe, expect, it, vi } from "vitest";
import { fimDoSilencioCurto } from "@/lib/agent-engine/agent/silencio-curto";
import { MOTIVO_ATENDIMENTO_MANUAL } from "@/lib/escalacao/atendimento-manual";

const dbCom = (rows: unknown[]) => ({ query: vi.fn().mockResolvedValue({ rows }) }) as never;

describe("fimDoSilencioCurto", () => {
  it("sem conversa não há o que adiar", async () => {
    expect(await fimDoSilencioCurto(dbCom([]), "org", null)).toBeNull();
  });
  it("devolve o fim da pausa quando o banco reconhece o silêncio curto", async () => {
    const db = dbCom([{ ate: "2026-11-15T21:12:32.280Z" }]);
    const fim = await fimDoSilencioCurto(db, "org", "conv");
    expect(fim?.toISOString()).toBe("2026-11-15T21:12:32.280Z");
  });
  it("cobre a resposta pelo celular e só adia se a última palavra é do cliente", async () => {
    const db = dbCom([]);
    await fimDoSilencioCurto(db, "org", "conv");
    const [sql, params] = (db as unknown as { query: ReturnType<typeof vi.fn> }).query.mock.calls[0];
    expect(params).toEqual(["conv", "org", MOTIVO_ATENDIMENTO_MANUAL]);
    expect(sql).toContain("last_handoff_reason = $3");
    expect(sql).toContain("= 'inbound'");
  });
  it("sem linha (outra trava, ou a pessoa já respondeu) fica como antes: pula", async () => {
    expect(await fimDoSilencioCurto(dbCom([]), "org", "conv")).toBeNull();
  });
  it("erro de banco não derruba o turno", async () => {
    const db = { query: vi.fn().mockRejectedValue(new Error("x")) } as never;
    expect(await fimDoSilencioCurto(db, "org", "conv")).toBeNull();
  });
});
