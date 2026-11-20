import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import { flowGraphSchema } from "../lib/followup/graph-schema";
import { processNode, type EnrollmentRow, type LeadFacts } from "../lib/followup/node-handlers";

const [sourcePath, outputPath] = process.argv.slice(2);
if (!sourcePath || !outputPath) throw new Error("Uso: biblioteca.json recibo.json");
const source = JSON.parse(readFileSync(sourcePath, "utf8")) as { code: string; graph: unknown }[];
const clock = () => new Date("2026-11-14T12:00:00Z");
const enrollment = { steps_taken: 0, timing_plan: null } as EnrollmentRow;
const lead = { tags: [], contact_name: null, custom_fields: {} } as unknown as LeadFacts;
const results = source.map((flow) => {
  const graph = flowGraphSchema.parse(flow.graph);
  let checks = 0;
  for (const node of graph.nodes) {
    const args = { node, edges: graph.edges, enrollment, lead, clock };
    const initial = processNode(args);
    if (node.type === "action") {
      assert.equal(initial.kind, "enqueue_turn");
      assert.equal(processNode({ ...args, actionEnqueued: true }).kind, "recheck");
      assert.equal(processNode({ ...args, actionEnqueued: true, actionCompleted: true }).kind, "advance");
      checks += 3;
    } else if (node.type === "wait" && node.config.mode === "fixed") {
      assert.equal(initial.kind, "wait");
      if (initial.kind === "wait") assert.equal(initial.next_eval_at.getTime() - clock().getTime(), node.config.duration_ms);
      assert.equal(processNode({ ...args, waitElapsed: true }).kind, "advance");
      checks += 3;
    } else if (node.type === "match_reply") {
      assert.equal(initial.kind, "wait");
      const replied = processNode({ ...args, wokeEarly: true, lastInboundBody: "Ana" });
      const timeout = processNode({ ...args, waitElapsed: true });
      assert.equal(replied.kind, "advance"); assert.equal(timeout.kind, "advance");
      const expectedReply = graph.edges.find((e) => e.source === node.id && e.condition.type === "always")!.target;
      const expectedTimeout = graph.edges.find((e) => e.source === node.id && e.condition.type === "branch" && e.condition.branch_id === "no_reply")!.target;
      if (replied.kind === "advance") assert.equal(replied.next_node_id, expectedReply);
      if (timeout.kind === "advance") assert.equal(timeout.next_node_id, expectedTimeout);
      checks += 5;
    } else {
      assert.equal(initial.kind, node.type === "end" ? "complete" : "advance");
      checks++;
    }
  }
  return { code: flow.code, nodes: graph.nodes.length, checks, passed: true };
});
const receipt = { checkedAt: new Date().toISOString(), simulation: true, database: false,
  channelDelivery: false, sending: false, results };
writeFileSync(outputPath, JSON.stringify(receipt, null, 2));
console.info(JSON.stringify(receipt));
