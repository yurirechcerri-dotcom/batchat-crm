import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const banco = vi.hoisted(() => ({ contato: null as { id: string; tags: string[] } | null, gravado: null as unknown }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ limit: () => ({ maybeSingle: async () => ({ data: banco.contato }) }) }), ilike: () => ({ limit: () => ({ maybeSingle: async () => ({ data: banco.contato }) }) }) }) }),
      update: (v: unknown) => ({ eq: () => ({ eq: async () => { banco.gravado = v; return { error: null }; } }) }),
      insert: (v: unknown) => ({ select: () => ({ single: async () => { banco.gravado = v; return { data: { id: "novo" }, error: null }; } }) }),
    }),
  }),
}));

import { POST } from "./route";

const req = (corpo: unknown) =>
  new NextRequest("http://x/api/v1/webhooks/cakto", { method: "POST", body: JSON.stringify(corpo) });
const pedido = { id: "1", customer: { name: "Ana", phone: "5554999999999" }, product: { short_id: "abc" } };

beforeEach(() => {
  banco.contato = null;
  banco.gravado = null;
  process.env.CAKTO_WEBHOOK_SECRET = "s3";
  process.env.CAKTO_ORGANIZATION_ID = "org";
});

describe("POST /webhooks/cakto", () => {
  it("sem configuração: 503", async () => {
    delete process.env.CAKTO_WEBHOOK_SECRET;
    expect((await POST(req({ secret: "s3", event: "purchase_approved", data: pedido }))).status).toBe(503);
  });
  it("secret errado: 401 e nada gravado", async () => {
    expect((await POST(req({ secret: "x", event: "purchase_approved", data: pedido }))).status).toBe(401);
    expect(banco.gravado).toBeNull();
  });
  it("evento desconhecido: 200 sem efeito", async () => {
    expect((await POST(req({ secret: "s3", event: "evento_novo", data: pedido }))).status).toBe(200);
    expect(banco.gravado).toBeNull();
  });
  it("compra aprovada de contato novo cria com a etiqueta", async () => {
    expect((await POST(req({ secret: "s3", event: "purchase_approved", data: pedido }))).status).toBe(200);
    expect((banco.gravado as { tags: string[] }).tags).toContain("cakto-comprou");
  });
  it("reenvio para quem já tem a etiqueta não grava de novo", async () => {
    banco.contato = { id: "c1", tags: ["cakto-comprou", "cakto-prod-abc"] };
    await POST(req({ secret: "s3", event: "purchase_approved", data: pedido }));
    expect(banco.gravado).toBeNull();
  });
});
