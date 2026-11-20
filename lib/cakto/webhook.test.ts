import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { compradorDoEvento, etiquetasDoEvento, origemValida, unirEtiquetas } from "./webhook";

const segredo = "segredo-de-teste";
const corpo = JSON.stringify({ secret: segredo, event: "purchase_approved", data: { id: "1" } });
const ts = "1794700000";
const assina = (c: string, t = ts) => `v1=${createHmac("sha256", segredo).update(`${t}.`).update(c).digest("hex")}`;
const agora = Number(ts) * 1000;

describe("origemValida", () => {
  it("aceita a assinatura do cabeçalho", () => {
    expect(origemValida({ corpoCru: corpo, timestamp: ts, assinatura: assina(corpo), secretDoCorpo: "x", segredo, agora })).toBe(true);
  });
  it("recusa assinatura errada e corpo adulterado", () => {
    expect(origemValida({ corpoCru: corpo + " ", timestamp: ts, assinatura: assina(corpo), secretDoCorpo: segredo, segredo, agora })).toBe(false);
  });
  it("recusa entrega antiga (mais de 5 min)", () => {
    expect(origemValida({ corpoCru: corpo, timestamp: ts, assinatura: assina(corpo), secretDoCorpo: null, segredo, agora: agora + 6 * 60_000 })).toBe(false);
  });
  it("sem cabeçalho, vale o secret do corpo; sem segredo configurado, nunca", () => {
    expect(origemValida({ corpoCru: corpo, timestamp: null, assinatura: null, secretDoCorpo: segredo, segredo })).toBe(true);
    expect(origemValida({ corpoCru: corpo, timestamp: null, assinatura: null, secretDoCorpo: "", segredo: "" })).toBe(false);
  });
});

describe("etiquetasDoEvento", () => {
  const data = { id: "1", product: { short_id: "42bruPi", name: "Produto" } };
  it("compra aprovada vira cakto-comprou + produto", () => {
    expect(etiquetasDoEvento("purchase_approved", data)).toEqual(["cakto-comprou", "cakto-prod-42brupi"]);
  });
  it("reembolso e chargeback usam os nomes reais; refund_requested não conta", () => {
    expect(etiquetasDoEvento("refund", data)[0]).toBe("cakto-reembolso");
    expect(etiquetasDoEvento("chargeback", data)[0]).toBe("cakto-chargeback");
    expect(etiquetasDoEvento("refund_requested", data)).toEqual([]);
  });
  it("evento desconhecido não faz nada", () => {
    expect(etiquetasDoEvento("evento_novo", data)).toEqual([]);
  });
});

describe("compradorDoEvento e unirEtiquetas", () => {
  it("lê pedido, lista (V2) e abandono de checkout", () => {
    expect(compradorDoEvento({ customer: { name: "Ana", email: "a@a.com", phone: "5534999999999" } }).telefone).toBe("5534999999999");
    expect(compradorDoEvento([{ customer: { name: "Bia" } }]).nome).toBe("Bia");
    expect(compradorDoEvento({ customerEmail: "c@c.com" }).email).toBe("c@c.com");
  });
  it("reenviar o mesmo evento não duplica etiqueta", () => {
    const um = unirEtiquetas(["aluno"], ["cakto-comprou"]);
    expect(unirEtiquetas(um, ["cakto-comprou"])).toEqual(["aluno", "cakto-comprou"]);
  });
});
