import { describe, it, expect } from "vitest";
import { validarSinal, textoDaMensagem, type Classificacao } from "@/lib/radar/contrato";

const check = (texto: string, categoria: Classificacao["categoria"], trecho = texto) => validarSinal({ categoria, confianca: "alta", trecho }, texto);
describe("Radar: evidência e autorização de pausa", () => {
  it.each([
    ["Quero comprar agora", "compra"], ["Vamos fechar", "compra"],
    ["Me manda o pix", "compra"], ["Quero falar com o Yuri", "humano"],
    ["Chama um atendente", "humano"], ["Tem desconto?", "negociacao"], ["Tem desconto se eu pagar à vista?", "negociacao"],
  ] as const)("pausa pedido explícito: %s", (text, category) => expect(check(text, category)?.pedir_pausa).toBe(true));
  it.each([
    ["Não quero comprar", "compra", "quero comprar"],
    ["Meu amigo disse: quero comprar", "compra", "quero comprar"],
    ["Como funciona o pagamento?", "compra", "pagamento"],
    ["Yuri é o nome da empresa?", "humano", "Yuri"],
    ["Se eu quiser comprar", "compra", "comprar"],
    ["Talvez vou comprar", "compra", "vou comprar"],
    ["No exemplo está escrito: quero comprar", "compra", "quero comprar"],
    ["Quanto custa?", "duvida", "Quanto custa?"],
    ["Preciso melhorar as vendas", "interesse", "melhorar as vendas"],
  ] as const)("não pausa: %s", (text, category, quote) => expect(check(text, category, quote)?.pedir_pausa).toBe(false));
  it("rejeita evidência inventada ou vazia", () => {
    expect(check("Bom dia", "compra", "quero comprar")).toBeNull();
    expect(check("Oi", "humano", "")).toBeNull();
  });
  it("confiança moderada só alerta", () => {
    expect(validarSinal({ categoria: "compra", confianca: "media", trecho: "Quero comprar" }, "Quero comprar")?.pedir_pausa).toBe(false);
  });
  it("não mostra anonimização nem interpreta descrição de imagem como fala", () => {
    expect(textoDaMensagem({ body: "[mensagem anonimizada]", type: "audio", media_derived_status: "ready", media_derived_text: "quero comprar" })).toBe("");
    expect(textoDaMensagem({ type: "image", media_derived_status: "ready", media_derived_text: "quero comprar" })).toBe("");
    expect(textoDaMensagem({ type: "audio", media_derived_status: "ready", media_derived_text: "\nQuero comprar\n" })).toBe("Quero comprar");
  });
  it("trecho com emoji permanece literal", () => {
    const text = "🙂 Quero comprar";
    const signal = check(text, "compra", "Quero comprar")!;
    expect(text.slice(signal.trecho_inicio, signal.trecho_inicio + signal.trecho_tamanho)).toBe("Quero comprar");
  });
});
