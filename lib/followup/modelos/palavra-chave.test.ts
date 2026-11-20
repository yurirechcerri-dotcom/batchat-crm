/**
 * As automações por palavra-chave têm de nascer VÁLIDAS: o grafo passa pelo
 * schema e pelo publicador, e a regra passa pela porta da API. Um modelo
 * quebrado só apareceria quando alguém tentasse publicar.
 */
import { describe, expect, it } from "vitest";

import { flowGraphSchema } from "@/lib/followup/graph-schema";
import { validateFlowForPublish } from "@/lib/followup/validate-publish";
import { evaluateConditions } from "@/lib/automation/conditions";
import { createAutomationRuleSchema } from "@/lib/schemas";
import {
  MODELOS_DE_PALAVRA,
  comLink,
  modeloDePalavraPorId,
  montarGrafoDePalavra,
  montarRegraDePalavra,
  separarPalavras,
} from "./palavra-chave";

const FLUXO = "11111111-1111-4111-8111-111111111111";

describe("catálogo", () => {
  it("ids únicos e toda sugestão tem palavra e texto", () => {
    expect(new Set(MODELOS_DE_PALAVRA.map((m) => m.id)).size).toBe(MODELOS_DE_PALAVRA.length);
    for (const m of MODELOS_DE_PALAVRA) {
      expect(m.palavraPadrao.length).toBeGreaterThan(1);
      expect(m.mensagemPadrao.length).toBeGreaterThan(10);
      expect(m.canais.length).toBeGreaterThan(0);
      expect(m.titulo.split(" ").length).toBeLessThanOrEqual(3);
      // O link entra sozinho no fim: o texto sugerido não carrega marcador nem URL.
      expect(m.mensagemPadrao).not.toMatch(/\[link\]|https?:/);
    }
  });

  it("o modelo do material grátis é o primeiro e sugere AGENTES", () => {
    expect(MODELOS_DE_PALAVRA[0]?.palavraPadrao).toBe("AGENTES");
    expect(modeloDePalavraPorId("palavra-entrega-material")).toBeDefined();
    expect(modeloDePalavraPorId("nao-existe")).toBeUndefined();
  });
});

describe("grafo", () => {
  it("passa pelo schema e é publicável sem aviso de erro", () => {
    const grafo = flowGraphSchema.parse(montarGrafoDePalavra("Oi! Aqui está 👇\nhttps://exemplo.com/guia"));
    const r = validateFlowForPublish(grafo);
    expect(r.ok).toBe(true);
  });

  it("manda UMA mensagem e termina — não espera resposta nem agenda nada", () => {
    const g = montarGrafoDePalavra("texto");
    expect(g.nodes.map((n) => n.type)).toEqual(["trigger", "action", "end"]);
  });
});

describe("regra", () => {
  it("passa pela porta da API e liga o fluxo pelo start_message_flow", () => {
    const r = createAutomationRuleSchema.parse(montarRegraDePalavra({ nome: "R", palavras: ["agentes"], flowPointerId: FLUXO }));
    expect(r.trigger_event).toBe("message.received");
    expect(r.actions[0]).toMatchObject({ type: "start_message_flow", config: { flow_pointer_id: FLUXO } });
  });

  it("casa a palavra em qualquer caixa, no meio da frase, e várias palavras valem por qualquer uma", () => {
    const regra = createAutomationRuleSchema.parse(
      montarRegraDePalavra({ nome: "R", palavras: ["AGENTES", "quero"], flowPointerId: FLUXO }),
    );
    const msg = (t: string) => ({ event: { body_preview: t } });
    expect(evaluateConditions(regra.conditions, msg("agentes"))).toBe(true);
    expect(evaluateConditions(regra.conditions, msg("Oi, quero o guia"))).toBe(true);
    expect(evaluateConditions(regra.conditions, msg("bom dia"))).toBe(false);
  });
});

describe("texto", () => {
  it("separarPalavras tira vazios e repetidos", () => {
    expect(separarPalavras("agentes, Agentes ,, quero;\nguia")).toEqual(["agentes", "quero", "guia"]);
  });

  it("comLink põe o link na marca, no fim quando não há marca, e some sem link", () => {
    expect(comLink("Oi 👇\n[link]", "https://a.co")).toBe("Oi 👇\nhttps://a.co");
    expect(comLink("Oi!", "https://a.co")).toBe("Oi!\nhttps://a.co");
    expect(comLink("Oi!\n[link]", undefined)).toBe("Oi!");
  });
});
