import { z } from "zod";
import { actionConfigSchema, flowGraphSchema, waitConfigSchema } from "../graph-schema";

const id = z.string().min(1).max(128);
const next = id.nullable();
const attachment = z.strictObject({
  name: z.string(),
  mime: z.string(),
  size: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
const step = z.discriminatedUnion("kind", [
  z.strictObject({ id, kind: z.literal("wait"), ms: z.number().int().nonnegative(), next }),
  z.strictObject({
    id,
    kind: z.literal("message"),
    text: z.string(),
    next,
    attachment: attachment.optional(),
    voiceNote: z.boolean().optional(),
  }),
  z.strictObject({
    id,
    kind: z.literal("question"),
    text: z.string(),
    next,
    onTimeout: next,
    timeoutMs: z.number().int().positive(),
    saveAs: id.optional(),
    parse: z.string().optional(),
    reask: z.string().optional(),
    maxTries: z.number().int().positive().optional(),
  }),
]);
export const legacySequenceSchema = z.strictObject({
  sequence: z.strictObject({
    id,
    start: id,
    defaults: z.record(z.string(), z.string()),
    steps: z.array(step).min(1).max(2000),
  }),
  mediaFiles: z.record(z.string(), z.string().min(1)),
  mediaBase: z.string(),
});
export type LegacySequence = z.infer<typeof legacySequenceSchema>;
type Edge = { from: string; to: string; route: "next" | "timeout" };
type Blocker = { stepId: string | null; code: string };

/** Preparação local somente. Não produz FlowGraph nem publica/enrola contatos.
 * A fonte integral fica no pacote privado; report não contém copy/defaults/URLs.
 */
export function prepararSequenciaLegada(input: unknown) {
  const source = legacySequenceSchema.parse(input);
  const { steps, start } = source.sequence;
  const byId = new Map(steps.map((s) => [s.id, s]));
  if (byId.size !== steps.length) throw new Error("duplicate_step_id");
  if (!byId.has(start)) throw new Error("invalid_start");
  const edges: Edge[] = [];
  for (const s of steps) {
    if (s.next !== null) edges.push({ from: s.id, to: s.next, route: "next" });
    if (s.kind === "question" && s.onTimeout !== null)
      edges.push({ from: s.id, to: s.onTimeout, route: "timeout" });
  }
  if (edges.some((e) => !byId.has(e.to))) throw new Error("dangling_edge");
  const visited = new Set<string>();
  const pending = [start];
  while (pending.length) {
    const current = pending.pop()!;
    if (visited.has(current)) continue;
    visited.add(current);
    pending.push(...edges.filter((e) => e.from === current).map((e) => e.to));
  }
  if (visited.size !== steps.length) throw new Error("unreachable_steps");
  const attachments = steps.filter((s) => s.kind === "message" && s.attachment);
  if (
    attachments.some((s) => !source.mediaFiles[s.id]) ||
    Object.keys(source.mediaFiles).some((key) => !attachments.some((s) => s.id === key))
  )
    throw new Error("media_mapping_mismatch");

  const blockers: Blocker[] = [{ stepId: null, code: "native_compilation_required" }];
  // Usa o limite do schema vigente; estes nós são somente sondas de tamanho,
  // nunca são emitidos como grafo convertido nem usados para ativação.
  const sizeProbe = Array.from({ length: steps.length + 2 }, (_, i) => ({
    id: `probe-${i}`,
    type: "trigger",
    label: "probe",
    position: { x: 0, y: 0 },
    config: {},
  }));
  if (!flowGraphSchema.safeParse({ nodes: sizeProbe, edges: [] }).success)
    blockers.push({ stepId: null, code: "native_graph_size_rejected" });
  const kinds = { wait: 0, message: 0, question: 0 };
  for (const s of steps) {
    kinds[s.kind]++;
    if (
      s.kind === "wait" &&
      !waitConfigSchema.safeParse({ mode: "fixed", duration_ms: s.ms }).success
    )
      blockers.push({ stepId: s.id, code: "native_wait_rejected" });
    if (s.kind === "question") {
      blockers.push({ stepId: s.id, code: "question_semantics_required" });
      if (s.saveAs || s.parse || s.reask || s.maxTries)
        blockers.push({ stepId: s.id, code: "answer_capture_required" });
    }
    if (s.kind === "message") {
      const candidate = {
        mode: "text",
        body: s.text,
        ...(s.attachment ? { media_url: "https://media.invalid/private-placeholder" } : {}),
      };
      if (!actionConfigSchema.safeParse(candidate).success)
        blockers.push({ stepId: s.id, code: "native_action_rejected" });
      if (s.attachment) blockers.push({ stepId: s.id, code: "private_media_resolution_required" });
    }
  }
  return {
    source,
    report: {
      sourceSteps: steps.length,
      kinds,
      attachmentCount: attachments.length,
      edges,
      blockers,
      directImportReady: false as const,
      sourceOnly: true as const,
      activationAllowed: false as const,
    },
  };
}
