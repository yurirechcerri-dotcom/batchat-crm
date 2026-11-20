import { describe, expect, it } from "vitest";
import { formatarFaltam } from "@/components/inbox/ContagemDoAutomatico";

describe("contador do automático", () => {
  it("mostra minutos e segundos que faltam", () => {
    expect(formatarFaltam(5 * 60 * 1000)).toBe("5:00");
    expect(formatarFaltam(3 * 60 * 1000 + 42 * 1000)).toBe("3:42");
    expect(formatarFaltam(8_000)).toBe("0:08");
  });
  it("passando de uma hora mostra horas", () => {
    expect(formatarFaltam(58 * 60 * 1000)).toBe("58:00");
    expect(formatarFaltam(3600 * 1000 + 2 * 60 * 1000 + 30 * 1000)).toBe("1:02:30");
  });
  it("arredonda para cima e nunca fica negativo", () => {
    expect(formatarFaltam(1)).toBe("0:01");
    expect(formatarFaltam(-5000)).toBe("0:00");
  });
});
