import { describe, expect, it } from "vitest";

import { pisoDoInboundDaEspera } from "@/lib/followup/node-handlers";
import type { FlowNode } from "@/lib/followup/graph-schema";

const no = {
  id: "s15", type: "match_reply", label: "Aguardar resposta", position: { x: 0, y: 0 },
  config: { branches: [{ id: "respondeu", label: "Resposta", op: "contains", pattern: "sim" }], grace_timeout_ms: 1_800_000 },
} as unknown as Extract<FlowNode, { type: "match_reply" }>;

describe("piso do inbound da espera", () => {
  it("resposta que chega ANTES de o motor estacionar usa a hora da pergunta, não o updated_at regravado", () => {
    const eventos = [
      { node_id: "s14", idempotency_key: null, event_type: "action_sent", created_at: "2026-11-16T16:43:24.386Z" },
      { node_id: "s15", idempotency_key: null, event_type: "inbound_woke", created_at: "2026-11-16T16:43:49.103Z" },
    ];
    // updated_at já foi regravado pelo próprio inbound_woke (49.10) e esconderia a resposta de 48.65.
    const piso = pisoDoInboundDaEspera(no, eventos, "2026-11-16T16:43:49.100Z");
    expect(Date.parse(piso)).toBeLessThanOrEqual(Date.parse("2026-11-16T16:43:48.649Z"));
    expect(piso).toBe("2026-11-16T16:43:24.386Z");
  });

  it("com wait_started, continua valendo o instante em que a espera começou", () => {
    const eventos = [
      { node_id: "s14", idempotency_key: null, event_type: "action_sent", created_at: "2026-11-16T16:00:00.000Z" },
      { node_id: "s15", idempotency_key: null, event_type: "wait_started", payload: { next_eval_at: "2026-11-16T17:30:00.000Z" }, created_at: "2026-11-16T17:00:01.000Z" },
    ];
    expect(pisoDoInboundDaEspera(no, eventos, "x")).toBe("2026-11-16T17:00:00.000Z");
  });

  it("sem nenhum evento utilizável, cai no fallback de sempre", () => {
    expect(pisoDoInboundDaEspera(no, [], "2026-11-16T10:00:00.000Z")).toBe("2026-11-16T10:00:00.000Z");
  });
});
