import { describe, expect, it } from "vitest";
import { revisarCadencia } from "@/lib/followup/importacao/revisar-cadencia";
import { flowGraphSchema } from "@/lib/followup/graph-schema";
import { processNode, type EnrollmentRow, type LeadFacts } from "@/lib/followup/node-handlers";

function fixture() {
  const n = (id: string, type: string, config: unknown) => ({ id, type, label: id, position: { x: 0, y: 0 }, config });
  const e = (source: string, target: string, branch?: string) => ({ id: `${source}-${target}-${branch ?? "always"}`, source, target, priority: 0,
    condition: branch ? { type: "branch", branch_id: branch } : { type: "always" } });
  return flowGraphSchema.parse({ nodes: [n("start", "trigger", {}), n("prompt", "action", { mode: "text", body: "Posso seguir?" }),
    n("question", "match_reply", { branches: [{ id: "sim", label: "Sim", op: "eq", pattern: "sim" }], entrada_importada: "text", grace_timeout_ms: 1800000 }),
    n("next", "end", { outcome: "exhausted" }), n("timeout", "end", { outcome: "exhausted" })],
    edges: [e("start", "prompt"), e("prompt", "question"), e("question", "next"), e("question", "next", "sim"), e("question", "timeout", "no_reply")] });
}
describe("lembrete somente no silêncio", () => {
  it("não altera o original; resposta pula lembrete e timeout chega nele", () => {
    const original = fixture(); const before = structuredClone(original);
    const { graph } = revisarCadencia(original, [{ nodeId: "prompt", texto: "Me conta o que achou.", somenteSemResposta: true }], {});
    expect(original).toEqual(before);
    expect(graph.edges.find((e) => e.source === "start")?.target).toBe("question");
    const clock = () => new Date("2026-11-14T12:00:00Z");
    const args = { edges: graph.edges, enrollment: {} as EnrollmentRow, lead: {} as LeadFacts, clock };
    const question = graph.nodes.find((n) => n.id === "question")!;
    const after = graph.nodes.find((n) => n.id === "apos-lembrete-prompt")!;
    expect(processNode({ ...args, node: question })).toMatchObject({ kind: "wait", next_eval_at: new Date("2026-11-14T12:30:00Z") });
    for (const text of ["sim", "entendi", "quero saber mais"]) {
      expect(processNode({ ...args, node: question, wokeEarly: true, lastInboundBody: text })).toMatchObject({ kind: "advance", next_node_id: "next" });
      expect(processNode({ ...args, node: after, wokeEarly: true, lastInboundBody: text })).toMatchObject({ kind: "advance", next_node_id: "next" });
    }
    expect(processNode({ ...args, node: question, waitElapsed: true })).toMatchObject({ kind: "advance", next_node_id: "prompt" });
    expect(processNode({ ...args, node: after, waitElapsed: true })).toMatchObject({ kind: "advance", next_node_id: "timeout" });
  });
});
