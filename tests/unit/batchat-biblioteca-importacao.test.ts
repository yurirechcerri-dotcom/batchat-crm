import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { compilarDocumentoBatchat } from "@/lib/followup/importacao/compilar-batchat";
import { flowGraphSchema } from "@/lib/followup/graph-schema";
import { limitesDaCadencia } from "@/lib/followup/limites-da-cadencia";
import { resolverMidiaDoFluxo } from "@/lib/followup/midia-privada";
import { respostaImportada } from "@/lib/followup/resposta-importada";
import { runFollowupClock } from "@/lib/followup/clock-loop";
import type { Logger } from "@/lib/agent-engine/obs/logger";

const org = "11111111-1111-4111-8111-111111111111";
const hash = "a".repeat(64);
const ref = `storage://followup-media/${org}/${hash}.mp3`;
const options = { mediaByHash: { [hash]: ref }, linksByAnchor: { checkout: "https://example.com/checkout" } };
const end = { kind: "end" };
function document() {
  return { kind: "batchat-authored-flow", channel: "whatsapp", schemaVersion: 2,
    entry: { kind: "node", nodeId: "a" }, nodes: [
      { id: "a", content: { kind: "message", text: "Olá {{first_name}}!", media: [], buttons: [], continuation: "automatic" } },
      { id: "b", content: { kind: "messageDelay", seconds: 3 } },
      { id: "c", content: { kind: "message", text: "", media: [{ kind: "private-asset", bindingId: "asset", contentSha256: hash }], buttons: [], continuation: "automatic" } },
      { id: "q", content: { kind: "question", storage: { kind: "contact-field", field: "first_name" },
        timeout: { kind: "after", seconds: 1800, target: end }, nextTarget: end,
        acceptance: { kind: "explicit", skip: { kind: "disabled" }, trim: true, invalid: { kind: "wait" }, minCodePoints: 1, maxCodePoints: 2048 }, answerType: "first_name", answerMethod: "input" } },
    ], edges: [
      { source: "a", port: "next", target: { kind: "node", nodeId: "b" } },
      { source: "b", port: "next", target: { kind: "node", nodeId: "c" } },
      { source: "c", port: "next", target: { kind: "node", nodeId: "q" } },
    ] };
}

describe("importação da biblioteca", () => {
  it("mantém mídia sem legenda, 3 segundos e as saídas de resposta/timeout", () => {
    const graph = compilarDocumentoBatchat(document(), options);
    expect(graph.nodes).toHaveLength(6);
    expect(graph.nodes[1]?.config).toEqual({ mode: "text", body: "Olá {{primeiro_nome}}!" });
    expect(graph.nodes[2]?.config).toEqual({ mode: "fixed", duration_ms: 3000, preservar_prazo: true });
    expect(graph.nodes[3]?.config).toEqual({ mode: "text", body: "", media_url: ref });
    expect(graph.edges.filter((e) => e.source === "s4")).toHaveLength(3);
    expect(graph.nodes[4]?.config).toMatchObject({ save_to: { kind: "contact_name", formato: "first_name" } });
  });
  it("recusa mídia faltante, ligação incompleta e duplicada", () => {
    expect(() => compilarDocumentoBatchat(document(), { ...options, mediaByHash: {} })).toThrow("unresolved_private_media");
    const incomplete = document(); incomplete.edges[0]!.target.nodeId = "missing";
    expect(() => compilarDocumentoBatchat(incomplete, options)).toThrow("missing_source_target");
    const duplicate = document(); duplicate.edges.push(duplicate.edges[0]!);
    expect(() => compilarDocumentoBatchat(duplicate, options)).toThrow("ambiguous_next");
  });
  it("não aceita outro canal ou controle desconhecido", () => {
    expect(() => compilarDocumentoBatchat({ ...document(), channel: "instagram" }, options)).toThrow();
    const source = document(); source.nodes[0]!.content.kind = "unsupported";
    expect(() => compilarDocumentoBatchat(source, options)).toThrow();
  });
  it("preserva os limites normais e exige opção publicada para cadência longa", () => {
    expect(limitesDaCadencia()).toEqual({ nos: 60, arestas: 120, passos: 30, ticks: 80 });
    const graph = compilarDocumentoBatchat(document(), options);
    graph.nodes = Array.from({ length: 61 }, (_, i) => ({ id: `n${i}`, type: "trigger", label: "n", position: { x: 0, y: 0 }, config: {} }));
    graph.edges = [];
    expect(flowGraphSchema.safeParse({ ...graph, settings: undefined }).success).toBe(false);
    expect(flowGraphSchema.safeParse(graph).success).toBe(true);
    graph.nodes = Array.from({ length: 201 }, (_, i) => ({ ...graph.nodes[0]!, id: `n${i}` }));
    expect(flowGraphSchema.safeParse(graph).success).toBe(false);
    expect(limitesDaCadencia({ cadencia_estendida: true }).ticks).toBe(320);
  });
  it("valida nomes e limite de entrada sem classificador de IA", () => {
    expect(respostaImportada("  Ana Silva  ", "first_name")).toBe("Ana");
    expect(respostaImportada("1234", "first_name")).toBeNull();
    expect(respostaImportada("x".repeat(2049), "text")).toBeNull();
    expect(respostaImportada("", "text")).toBeNull();
  });
});

describe("mídia por organização", () => {
  it("assina na hora e não aceita referência de outra organização", async () => {
    const sign = vi.fn().mockResolvedValue({ data: { signedUrl: "https://example.com/audio.mp3?token=temporary" }, error: null });
    const from = vi.fn(() => ({ createSignedUrl: sign }));
    const admin = () => ({ storage: { from } } as unknown as SupabaseClient);
    expect(await resolverMidiaDoFluxo(org, ref, admin)).toContain("token=temporary");
    expect(sign).toHaveBeenCalledWith(`${org}/${hash}.mp3`, 3600);
    await expect(resolverMidiaDoFluxo("other", ref, admin)).rejects.toThrow("outside_organization");
    expect(sign).toHaveBeenCalledTimes(1);
    await expect(resolverMidiaDoFluxo(org, ref + "?evil=1", admin)).rejects.toThrow();
  });
});

describe("relógio durável", () => {
  it("espera o prazo de 3s e executa só um tick por vez", async () => {
    const abort = new AbortController(); const waits: number[] = [];
    const due = vi.fn().mockResolvedValueOnce(3000).mockResolvedValueOnce(0);
    const tick = vi.fn(async () => { abort.abort(); });
    await runFollowupClock({ nextDueMs: due, tick, sleep: async (ms) => { waits.push(ms); } }, {} as Logger, abort.signal);
    expect(waits).toEqual([3000]); expect(tick).toHaveBeenCalledTimes(1);
  });
  it("falha com recuo, sem loop apertado nem envio", async () => {
    const abort = new AbortController(); const tick = vi.fn(); const error = vi.fn();
    await runFollowupClock({ nextDueMs: async () => { throw new Error("database"); }, tick,
      sleep: async (ms) => { expect(ms).toBe(30000); abort.abort(); } }, { error } as unknown as Logger, abort.signal);
    expect(error).toHaveBeenCalledTimes(1); expect(tick).not.toHaveBeenCalled();
  });
});
