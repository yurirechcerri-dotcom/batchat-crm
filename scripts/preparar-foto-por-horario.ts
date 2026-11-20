/** Prepara versões novas a partir de snapshot privado; não publica nem inscreve. */
import { readFileSync, writeFileSync } from "node:fs";
import { flowGraphSchema, type FlowEdge } from "../lib/followup/graph-schema";
import { validateFlowForPublish } from "../lib/followup/validate-publish";

const [entrada, saida, original, dia, noite] = process.argv.slice(2);
if (!entrada || !saida || !original || !dia || !noite) {
  throw new Error("Uso: snapshot.json saida.json foto_original foto_dia foto_noite");
}
const registros = JSON.parse(readFileSync(entrada, "utf8")) as Array<{
  id: string; name: string; active_version_id: string; graph: unknown; draft_graph: unknown;
}>;
const alterados = registros.flatMap((registro) => {
  const graph = flowGraphSchema.parse(registro.graph);
  const fotos = graph.nodes.filter((n) => n.type === "action" && n.config.mode === "text" && n.config.media_url === original);
  if (fotos.length === 0) return [];
  if (JSON.stringify(registro.graph) !== JSON.stringify(registro.draft_graph)) throw new Error("Rascunho mudou: " + registro.id);
  for (const foto of fotos) {
    if (foto.type !== "action" || foto.config.mode !== "text") throw new Error("Foto não é ação fixa");
    const horario = foto.id + "-horario", escura = foto.id + "-noite";
    if (graph.nodes.some((n) => n.id === horario || n.id === escura)) throw new Error("Já tem condição de horário");
    const saidas = graph.edges.filter((e) => e.source === foto.id);
    const position = foto.position ?? { x: 0, y: 0 };
    graph.nodes.push({ id: horario, type: "condition", label: "Foto: dia ou noite", position: { x: position.x, y: position.y - 60 }, config: {
      combinator: "and", checks: [
        { field: "hora_local", op: "gte", value: "06:00" },
        { field: "hora_local", op: "lte", value: "17:29" },
      ],
    } });
    graph.nodes.push({ ...structuredClone(foto), id: escura, label: "Foto de boné · noite", position: { x: position.x + 360, y: position.y + 100 }, config: { ...foto.config, media_url: noite } });
    foto.label = "Foto clara · dia";
    foto.position = { x: position.x, y: position.y + 100 };
    foto.config.media_url = dia;
    for (const edge of graph.edges) if (edge.target === foto.id) edge.target = horario;
    const novas: FlowEdge[] = [
      { id: horario + "-sim", source: horario, target: foto.id, priority: 0, condition: { type: "cond_result", value: true } },
      { id: horario + "-nao", source: horario, target: escura, priority: 0, condition: { type: "cond_result", value: false } },
      ...saidas.map((e) => ({ ...structuredClone(e), id: e.id + "-noite", source: escura })),
    ];
    graph.edges.push(...novas);
  }
  const checked = flowGraphSchema.parse(graph);
  const validacao = validateFlowForPublish(checked);
  if (!validacao.ok) throw new Error(JSON.stringify({ id: registro.id, validacao }));
  return [{ id: registro.id, name: registro.name, previous: registro.active_version_id, before: registro.graph, graph: checked, photos: fotos.length }];
});
if (!alterados.length) throw new Error("Foto original não encontrada; nenhum fluxo alterado");
writeFileSync(saida, JSON.stringify(alterados, null, 2));
process.stdout.write(JSON.stringify(alterados.map(({ id, name, photos, graph }) => ({ id, name, photos, nodes: graph.nodes.length }))) + "\n");
