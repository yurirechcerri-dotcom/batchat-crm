import { readFileSync, writeFileSync } from "node:fs";
import { flowGraphSchema } from "../lib/followup/graph-schema";
import { validateFlowForPublish } from "../lib/followup/validate-publish";
import { revisarCadencia, type RevisaoDaMensagem } from "../lib/followup/importacao/revisar-cadencia";

const [sourcePath, revisionPath, outputPath, receiptPath] = process.argv.slice(2);
if (!sourcePath || !revisionPath || !outputPath || !receiptPath) throw new Error("Uso: original.json revisao.json resultado.json recibo.json");
const source = JSON.parse(readFileSync(sourcePath, "utf8")) as { code: string; name: string; graph: unknown }[];
const revision = JSON.parse(readFileSync(revisionPath, "utf8")) as {
  duracoes: Record<string, number>; fluxos: { code: string; revisoes: RevisaoDaMensagem[] }[];
};
const receipts: { code: string; changes: string[]; nodes: number }[] = [];
const result = source.map((flow) => {
  const edits = revision.fluxos.find((candidate) => candidate.code === flow.code);
  if (!edits) throw new Error(`revisao_ausente:${flow.code}`);
  const changed = revisarCadencia(flowGraphSchema.parse(flow.graph), edits.revisoes, revision.duracoes);
  const graph = flowGraphSchema.parse(changed.graph);
  const validation = validateFlowForPublish(graph);
  if (!validation.ok) throw new Error(`${flow.code}:${JSON.stringify(validation.errors)}`);
  receipts.push({ code: flow.code, changes: changed.changes, nodes: graph.nodes.length });
  return { ...flow, graph };
});
writeFileSync(outputPath, JSON.stringify(result, null, 2), { mode: 0o600 });
writeFileSync(receiptPath, JSON.stringify({ date: new Date().toISOString(), published: false, receipts }, null, 2));
console.info(JSON.stringify(receipts.map(({ code, nodes, changes }) => ({ code, nodes, changes: changes.length }))));
