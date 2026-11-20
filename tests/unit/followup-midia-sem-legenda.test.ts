import { describe, expect, it } from "vitest";

import { followupTurnPayloadSchema } from "@/lib/agent-engine/agent/followup-turn";
import { actionConfigSchema, flowGraphSchema } from "@/lib/followup/graph-schema";
import { validateFlowForPublish } from "@/lib/followup/validate-publish";

describe("passo de mídia sem legenda", () => {
  it.each(["foto.png", "voz.ogg", "video.mp4", "arquivo.pdf"])(
    "%s: editor e worker preservam a legenda vazia",
    (file) => {
      const url = `https://media.example/${file}`;
      const action = { mode: "text", body: "", media_url: url };
      expect(actionConfigSchema.parse(action)).toEqual(action);
      expect(followupTurnPayloadSchema.parse({ fixed_body: "", fixed_media_url: url }))
        .toEqual({ fixed_body: "", fixed_media_url: url });
    },
  );

  it.each(["", "   "])("recusa mensagem vazia sem mídia (%j)", (body) => {
    expect(actionConfigSchema.safeParse({ mode: "text", body }).success).toBe(false);
    expect(followupTurnPayloadSchema.safeParse({ fixed_body: body }).success).toBe(false);
  });

  it("URL inválida não libera corpo vazio; mídia sem fixed_body não vira turno da IA", () => {
    expect(actionConfigSchema.safeParse({ mode: "text", body: "", media_url: "arquivo.ogg" }).success)
      .toBe(false);
    expect(followupTurnPayloadSchema.safeParse({ fixed_body: "", fixed_media_url: "arquivo.ogg" }).success)
      .toBe(false);
    expect(followupTurnPayloadSchema.safeParse({ fixed_media_url: "https://media.example/voz.ogg" }).success)
      .toBe(false);
  });

  it("grafo de mídia chega à validação de publicação sem inventar texto", () => {
    const graph = flowGraphSchema.parse({
      nodes: [
        { id: "start", type: "trigger", label: "Entrada", position: { x: 0, y: 0 }, config: {} },
        { id: "media", type: "action", label: "Mídia", position: { x: 1, y: 0 },
          config: { mode: "text", body: "", media_url: "https://media.example/voz.ogg" } },
        { id: "end", type: "end", label: "Fim", position: { x: 2, y: 0 }, config: { outcome: "exhausted" } },
      ],
      edges: [
        { id: "a", source: "start", target: "media", condition: { type: "always" } },
        { id: "b", source: "media", target: "end", condition: { type: "always" } },
      ],
    });
    expect(validateFlowForPublish(graph).ok).toBe(true);
  });
});
