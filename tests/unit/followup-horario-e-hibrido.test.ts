import { describe, expect, it } from "vitest";
import { avaliarHorarioLocal } from "../../lib/followup/condicao-por-horario";
import { evaluateCondition, type LeadFacts } from "../../lib/followup/node-handlers";
import { conditionConfigSchema, type FlowNode, type FlowEdge } from "../../lib/followup/graph-schema";
import { desvioAntesDoEnvio } from "../../lib/followup/condicao-antes-do-envio";
import { silencioDeRespostaManual } from "../../lib/followup/silencio-de-resposta-manual";
import { opcaoLiberaEnvio } from "../../lib/followup/envio-com-o-dono";

const config = conditionConfigSchema.parse({ combinator: "and", checks: [
  { field: "hora_local", op: "gte", value: "06:00" },
  { field: "hora_local", op: "lte", value: "17:29" },
] });
const lead: LeadFacts = { fuso: "America/Sao_Paulo", lead_stage: null, tags: [], steps_taken: 0, last_outcome: null };

describe("foto por horário da organização", () => {
  it.each([
    ["05:59:59", false], ["06:00:00", true], ["17:29:59", true],
    ["17:30:00", false], ["23:59:59", false], ["00:00:00", false],
  ])("às %s escolhe o ramo claro=%s", (hora, claro) => {
    expect(evaluateCondition(config, lead, new Date(`2026-11-14T${hora}-03:00`))).toBe(claro);
  });
  it("usa o fuso configurado e não UTC do servidor", () => {
    const instante = new Date("2026-11-14T08:00:00Z");
    expect(evaluateCondition(config, lead, instante)).toBe(false);
    expect(evaluateCondition(config, { ...lead, fuso: "UTC" }, instante)).toBe(true);
  });
  it("recusa horários inválidos e operadores incompatíveis", () => {
    for (const valor of ["24:00", "06:60", "6:00", "", 360]) {
      expect(avaliarHorarioLocal("gte", valor, new Date(), lead.fuso)).toBe(false);
    }
    expect(avaliarHorarioLocal("contains", "06:00", new Date(), lead.fuso)).toBe(false);
  });
  it("reavalia se passar das 17h30 entre a condição e enfileirar a foto", () => {
    const nodes: FlowNode[] = [
      { id: "horario", type: "condition", label: "Horário", position: { x: 0, y: 0 }, config },
      { id: "dia", type: "action", label: "Dia", position: { x: 0, y: 100 }, config: { mode: "text", body: "dia" } },
      { id: "noite", type: "action", label: "Noite", position: { x: 300, y: 100 }, config: { mode: "text", body: "noite" } },
    ];
    const edges: FlowEdge[] = [
      { id: "a", source: "horario", target: "dia", priority: 0, condition: { type: "cond_result", value: true } },
      { id: "b", source: "horario", target: "noite", priority: 0, condition: { type: "cond_result", value: false } },
    ];
    expect(desvioAntesDoEnvio(nodes, edges, "dia", lead, new Date("2026-11-14T17:30:00-03:00")))
      .toEqual({ proximo: "noite", esperado: true, agora: false });
  });
});

describe("resposta humana no fluxo híbrido", () => {
  const envio = "2026-11-14T12:00:00Z", ate = "2026-11-14T12:05:00Z";
  it("distingue resposta manual de pausa explícita e dado ausente", () => {
    expect(silencioDeRespostaManual(ate, envio)).toBe(true);
    expect(silencioDeRespostaManual("infinity", envio)).toBe(false);
    expect(silencioDeRespostaManual(ate, null)).toBe(false);
    expect(silencioDeRespostaManual("2026-11-14T13:00:00Z", envio)).toBe(false);
    expect(silencioDeRespostaManual(ate, envio, envio)).toBe(false);
  });
  it("libera só fluxo híbrido, preservando bloqueio, outra pausa e opt-out", () => {
    const estado = { contatoVetado: false, conversaComDono: false, conversaSilenciadaSemDono: false, respostaManualRecente: true };
    expect(opcaoLiberaEnvio(true, estado)).toBe(true);
    expect(opcaoLiberaEnvio(false, estado)).toBe(false);
    expect(opcaoLiberaEnvio(true, { ...estado, contatoVetado: true })).toBe(false);
    expect(opcaoLiberaEnvio(true, { ...estado, conversaSilenciadaSemDono: true })).toBe(false);
  });
});
