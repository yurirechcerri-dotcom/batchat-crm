import { z } from "zod";
import { flowGraphSchema, type FlowGraph, type FlowNode } from "../graph-schema";
import { validateFlowForPublish } from "../validate-publish";

const targetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("node"), nodeId: z.string() }),
  z.object({ kind: z.literal("end") }),
]);
const mediaSchema = z.object({ kind: z.literal("private-asset"), bindingId: z.string(), contentSha256: z.string().regex(/^[a-f0-9]{64}$/) });
const contentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("message"), text: z.string(), media: z.array(mediaSchema).max(1), buttons: z.array(z.never()), continuation: z.literal("automatic") }),
  z.object({ kind: z.literal("smartDelay"), seconds: z.number().positive() }),
  z.object({ kind: z.literal("messageDelay"), seconds: z.number().positive() }),
  z.object({ kind: z.literal("question"),
    storage: z.discriminatedUnion("kind", [z.object({ kind: z.literal("none") }), z.object({ kind: z.literal("contact-field"), field: z.literal("first_name") })]),
    timeout: z.object({ kind: z.literal("after"), target: targetSchema, seconds: z.number().min(900) }),
    acceptance: z.object({ kind: z.literal("explicit"), skip: z.object({ kind: z.literal("disabled") }), trim: z.literal(true), invalid: z.object({ kind: z.literal("wait") }), minCodePoints: z.literal(1), maxCodePoints: z.literal(2048) }),
    answerType: z.enum(["text", "first_name"]), nextTarget: targetSchema, answerMethod: z.literal("input"),
  }),
]);
export const documentoBatchatSchema = z.object({
  kind: z.literal("batchat-authored-flow"), channel: z.literal("whatsapp"),
  schemaVersion: z.literal(2), entry: targetSchema,
  nodes: z.array(z.object({ id: z.string(), content: contentSchema })).min(1).max(198),
  edges: z.array(z.object({ source: z.string(), port: z.literal("next"), target: targetSchema })),
});
type Target = z.infer<typeof targetSchema>;

/** Compilação pura, sem envio, publicação ou leitura de credenciais.
 * Não converte referências incompletas em fim nem descarta nós sem avisar.
 */
export function compilarDocumentoBatchat(input: unknown, options: {
  mediaByHash: Record<string, string>; linksByAnchor: Record<string, string>;
}): FlowGraph {
  const source = documentoBatchatSchema.parse(input);
  const ids = new Map(source.nodes.map((node, i) => [node.id, `s${i + 1}`]));
  if (ids.size !== source.nodes.length) throw new Error("duplicate_source_node");
  const target = (value: Target): string => {
    if (value.kind === "end") return "end";
    const id = ids.get(value.nodeId);
    if (!id) throw new Error("missing_source_target");
    return id;
  };
  const edges: FlowGraph["edges"] = [];
  const edge = (from: string, to: string, condition: FlowGraph["edges"][number]["condition"] = { type: "always" }) => {
    edges.push({ id: `e${edges.length + 1}`, source: from, target: to, priority: 0, condition });
  };
  const nodes: FlowNode[] = [{ id: "start", type: "trigger", label: "Início manual", position: { x: 0, y: 0 }, config: {} }];
  edge("start", target(source.entry));
  for (const [index, item] of source.nodes.entries()) {
    const id = ids.get(item.id)!;
    const position = { x: 0, y: (index + 1) * 120 };
    const content = item.content;
    if (content.kind === "message") {
      const body = content.text.replaceAll("{{first_name}}", "{{primeiro_nome}}")
        .replace(/<<inline-button-anchor:([^>]+)>>/g, (_all, anchor: string) => {
          const link = options.linksByAnchor[anchor];
          if (!link || new URL(link).protocol !== "https:") throw new Error("unresolved_inline_link");
          return link;
        });
      if (/<<|{{(?!primeiro_nome}})/.test(body)) throw new Error("unresolved_text_variable");
      const media = content.media[0];
      const mediaUrl = media ? options.mediaByHash[media.contentSha256] : undefined;
      if (media && !mediaUrl) throw new Error("unresolved_private_media");
      nodes.push({ id, type: "action", label: media ? "Mídia original" : "Mensagem original", position,
        config: { mode: "text", body, ...(mediaUrl ? { media_url: mediaUrl } : {}) } });
    } else if (content.kind === "question") {
      nodes.push({ id, type: "match_reply", label: content.answerType === "first_name" ? "Guardar primeiro nome" : "Aguardar resposta", position,
        config: { branches: [{ id: "respondeu", label: "Resposta", op: "contains", pattern: "sim" }],
          grace_timeout_ms: content.timeout.seconds * 1000, entrada_importada: content.answerType,
          ...(content.storage.kind === "contact-field" ? { save_to: { kind: "contact_name", formato: "first_name" }, if_exists: "overwrite" } : {}) } });
      edge(id, target(content.nextTarget));
      edge(id, target(content.nextTarget), { type: "branch", branch_id: "respondeu" });
      edge(id, target(content.timeout.target), { type: "branch", branch_id: "no_reply" });
    } else {
      nodes.push({ id, type: "wait", label: `Esperar ${content.seconds}s`, position,
        config: { mode: "fixed", duration_ms: content.seconds * 1000, preservar_prazo: true } });
    }
    const outgoing = source.edges.filter((e) => e.source === item.id);
    if (content.kind === "question") {
      if (outgoing.length) throw new Error("question_has_ambiguous_edges");
    } else {
      if (outgoing.length !== 1) throw new Error("missing_or_ambiguous_next");
      edge(id, target(outgoing[0]!.target));
    }
  }
  if (source.edges.some((e) => !ids.has(e.source))) throw new Error("missing_edge_source");
  nodes.push({ id: "end", type: "end", label: "Fim da sequência", position: { x: 0, y: (nodes.length + 1) * 120 }, config: { outcome: "exhausted" } });
  const graph = flowGraphSchema.parse({ nodes, edges, settings: { cadencia_estendida: true } });
  const validation = validateFlowForPublish(graph, { surface: "followup", exigeModeloForaDaJanela: true });
  if (!validation.ok) throw new Error(`invalid_native_graph:${validation.errors.map((e) => e.code).join(",")}`);
  return graph;
}
