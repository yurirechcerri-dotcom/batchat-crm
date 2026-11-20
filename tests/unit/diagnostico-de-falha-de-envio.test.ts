import { beforeEach, describe, expect, it, vi } from "vitest";
import { registrarDiagnosticoDeFalhaDeEnvio } from "@/lib/messaging/diagnostico-de-falha-de-envio";
const { warn } = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { warn } }));
const UUID = "11111111-1111-4111-8111-111111111111";
const contexto = { organizationId: UUID, messageId: UUID, requestId: UUID };
const dados = () => warn.mock.calls[0]?.[1] as { network_codes: string[]; requestId?: string };
beforeEach(() => { warn.mockReset(); });

describe("diagnóstico estritamente limitado a códigos", () => {
  it("termina em ciclos e deduplica causas agregadas", () => {
    const erro: { code: string; cause?: unknown; errors?: unknown[] } = { code: "EAI_AGAIN" };
    erro.cause = erro;
    erro.errors = [erro, { code: "EAI_AGAIN" }, { code: "UND_ERR_SOCKET" }];
    registrarDiagnosticoDeFalhaDeEnvio(erro, contexto);
    expect(dados()).toEqual({
      phase: "send_pipeline", network_codes: ["EAI_AGAIN", "UND_ERR_SOCKET"],
      organization_id: UUID, message_id: UUID, requestId: UUID,
    });
  });
  it("limita profundidade e quantidade total de nós", () => {
    let profundo: unknown = { code: "CERT_HAS_EXPIRED" };
    for (let i = 0; i < 20; i++) profundo = { cause: profundo };
    registrarDiagnosticoDeFalhaDeEnvio(profundo, contexto);
    expect(dados().network_codes).toEqual([]);
    warn.mockClear();
    const errors = Array.from({ length: 100 }, () => ({ code: "ECONNRESET" }));
    errors[99] = { code: "ENOTFOUND" };
    registrarDiagnosticoDeFalhaDeEnvio(new AggregateError(errors), contexto);
    expect(dados().network_codes).toEqual(["ECONNRESET"]);
  });
  it("não lê getters nem serializa erro bruto ou IDs não canônicos", () => {
    const getter = vi.fn(() => { throw new Error("segredo"); });
    const erro = Object.defineProperties({}, {
      code: { get: getter }, cause: { get: getter }, errors: { get: getter },
      message: { get: getter }, stack: { get: getter }, toJSON: { get: getter },
    });
    registrarDiagnosticoDeFalhaDeEnvio(erro, {
      organizationId: "segredo", messageId: "https://segredo.test", requestId: "5551999999999",
    });
    expect(getter).not.toHaveBeenCalled();
    expect(dados()).toEqual({ phase: "send_pipeline", network_codes: [] });
  });
  it("tolera proxy hostil e logger indisponível", () => {
    const erro = new Proxy({}, { getOwnPropertyDescriptor() { throw new Error("privado"); } });
    expect(() => registrarDiagnosticoDeFalhaDeEnvio(erro, contexto)).not.toThrow();
    expect(dados().network_codes).toEqual([]);
    warn.mockImplementation(() => { throw new Error("logger"); });
    expect(() => registrarDiagnosticoDeFalhaDeEnvio({ code: "EAI_AGAIN" }, contexto)).not.toThrow();
  });
  it("não aceita códigos por prefixo, texto, nome ou propriedades herdadas", () => {
    const erro = Object.assign(Object.create({ code: "EAI_AGAIN" }), {
      message: "ECONNRESET", name: "UND_ERR_SOCKET", errors: [{ code: "ENOTFOUND segredo" }],
    });
    registrarDiagnosticoDeFalhaDeEnvio(erro, { ...contexto, requestId: `handoff-aviso-${UUID}/segredo` });
    expect(dados().network_codes).toEqual([]);
    expect(dados().requestId).toBeUndefined();
  });
});
