import { describe, expect, it } from "vitest";
import { prepararSequenciaLegada } from "@/lib/followup/importacao/sequencia-legada";

const source = () => ({
  sequence: {
    id: "synthetic",
    start: "wait",
    defaults: { first_name: "pessoa" },
    steps: [
      { id: "wait", kind: "wait", ms: 3000, next: "question" },
      {
        id: "question",
        kind: "question",
        text: "Qual seu nome?",
        timeoutMs: 1800000,
        saveAs: "first_name",
        parse: "first_name",
        reask: "Repita seu nome",
        maxTries: 3,
        next: "message",
        onTimeout: "timeout",
      },
      { id: "message", kind: "message", text: "Olá {{first_name}}", next: null },
      { id: "timeout", kind: "message", text: "Sem resposta", next: null },
    ],
  },
  mediaFiles: {},
  mediaBase: "private/copy",
});

describe("preparação sem perdas da sequência BatChat", () => {
  it("preserva conteúdo, espera curta e ramificação sem fingir grafo executável", () => {
    const original = source();
    const result = prepararSequenciaLegada(original);
    expect(result.source).toEqual(original);
    expect(result.report.sourceSteps).toBe(4);
    expect(result.report.edges).toHaveLength(3);
    expect(result.report.edges).toContainEqual({
      from: "question",
      to: "timeout",
      route: "timeout",
    });
    expect(result.report.directImportReady).toBe(false);
    expect(result.report.blockers).not.toContainEqual({ stepId: "wait", code: "native_wait_rejected" });
    expect(result.report.blockers).toContainEqual({
      stepId: "question",
      code: "question_semantics_required",
    });
    expect(result.source.sequence.steps[0]).toMatchObject({ ms: 3000 });
    expect(JSON.stringify(result.report)).not.toContain("Olá");
  });
  it("não descarta anexos sem legenda nem inventa texto para satisfazer o nativo", () => {
    const input = {
      sequence: {
        id: "media",
        start: "audio",
        defaults: {},
        steps: [
          {
            id: "audio",
            kind: "message",
            text: "",
            voiceNote: true,
            next: null,
            attachment: { name: "fake.ogg", mime: "audio/ogg", size: 3, sha256: "a".repeat(64) },
          },
        ],
      },
      mediaFiles: { audio: "clips/fake.ogg" },
      mediaBase: "private/copy",
    };
    const r = prepararSequenciaLegada(input);
    expect(r.source).toEqual(input);
    expect(r.report.blockers).not.toContainEqual({ stepId: "audio", code: "native_action_rejected" });
    expect(r.report.blockers).toContainEqual({
      stepId: "audio",
      code: "private_media_resolution_required",
    });
  });
  it("recusa ligação perdida e id duplicado", () => {
    const broken = source();
    broken.sequence.steps[0]!.next = "missing";
    expect(() => prepararSequenciaLegada(broken)).toThrow("dangling_edge");
    const duplicate = source();
    duplicate.sequence.steps.push(duplicate.sequence.steps[0]!);
    expect(() => prepararSequenciaLegada(duplicate)).toThrow("duplicate_step_id");
  });
  it("recusa entrada inválida e passos inalcançáveis", () => {
    const bad = source();
    bad.sequence.start = "missing";
    expect(() => prepararSequenciaLegada(bad)).toThrow("invalid_start");
    const orphan = source();
    orphan.sequence.steps[1]!.onTimeout = null as never;
    expect(() => prepararSequenciaLegada(orphan)).toThrow("unreachable_steps");
  });
  it("não perde campos desconhecidos silenciosamente", () => {
    expect(() => prepararSequenciaLegada({ ...source(), ignored: "value" })).toThrow();
  });
  it("não aceita referência de mídia sem anexo correspondente", () => {
    expect(() =>
      prepararSequenciaLegada({ ...source(), mediaFiles: { message: "fake.ogg" } }),
    ).toThrow("media_mapping_mismatch");
  });
  it("preserva 79 passos e sinaliza limite nativo sem truncar", () => {
    const steps = Array.from({ length: 79 }, (_, i) => ({
      id: `m${i}`,
      kind: "message",
      text: `Mensagem ${i}`,
      next: i < 78 ? `m${i + 1}` : null,
    }));
    const r = prepararSequenciaLegada({
      sequence: { id: "large", start: "m0", defaults: {}, steps },
      mediaFiles: {},
      mediaBase: "private/copy",
    });
    expect(r.source.sequence.steps).toHaveLength(79);
    expect(r.report.blockers).toContainEqual({ stepId: null, code: "native_graph_size_rejected" });
  });
});
