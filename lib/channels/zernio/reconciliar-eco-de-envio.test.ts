import { describe, expect, it } from "vitest";

import { reconciliarEcoDeEnvio } from "./reconciliar-eco-de-envio";
import type { ZernioInboundMessage } from "./webhook";

const sentAt = "2026-11-13T14:04:53.715Z";
const message: ZernioInboundMessage = {
  direction: "outbound",
  sentVia: "api",
  kind: "message",
  status: "sent",
  conversationId: "provider-conversation",
  externalId: "wamid.test",
  accountId: "account-1",
  text: "Oi! Para eu entender melhor e te orientar, qual é a sua loja ou atividade?",
  attachments: [],
  sentAt,
  identity: {
    phone: "+5511999999999",
    bsuid: null,
    username: null,
    displayName: "Contato",
    anchor: null,
  },
  referral: null,
};

function fakeAdmin(candidatas: Array<{ id: string }>, updateId = "ai-message-1") {
  const calls: Array<{ table: string; operation: string; method: string; args: unknown[] }> = [];
  let operation = "select";
  const filters: Array<[string, unknown[]]> = [];
  const builder = new Proxy(
    {},
    {
      get(_target, property) {
        if (property === "then") {
          return (resolve: (value: unknown) => unknown) =>
            resolve(
              operation === "select"
                ? { data: candidatas, error: null }
                : { data: updateId ? { id: updateId } : null, error: null },
            );
        }
        if (property === "maybeSingle") {
          return () => Promise.resolve({ data: updateId ? { id: updateId } : null, error: null });
        }
        return (...args: unknown[]) => {
          if (property === "update") operation = "update";
          calls.push({ table: "messages", operation, method: String(property), args });
          filters.push([String(property), args]);
          return builder;
        };
      },
    },
  );
  const admin = {
    from: (table: string) => {
      calls.push({ table, operation: "select", method: "from", args: [] });
      return builder;
    },
  } as never;
  return { admin, calls, filters };
}

const scope = {
  organizationId: "org-1",
  conversationId: "conversation-1",
  contactId: "contact-1",
  channelSessionId: "session-1",
  message,
};

describe("reconciliarEcoDeEnvio", () => {
  it("reusa uma tentativa única da IA e grava o recibo do provedor na mesma linha", async () => {
    const { admin, calls, filters } = fakeAdmin([{ id: "ai-message-1" }]);

    await expect(reconciliarEcoDeEnvio(admin, scope)).resolves.toBe("ai-message-1");
    expect(calls.some((call) => call.method === "insert")).toBe(false);
    expect(calls.find((call) => call.method === "update")?.args[0]).toEqual({
      external_id: "wamid.test",
      status: "sent",
      sent_at: sentAt,
      error_code: null,
      error_message: null,
    });
    expect(filters).toContainEqual(["eq", ["sent_via", "ai"]]);
    expect(filters).toContainEqual(["eq", ["body", message.text]]);
  });

  it("não escolhe quando há duas tentativas candidatas", async () => {
    const { admin, calls } = fakeAdmin([{ id: "a" }, { id: "b" }]);

    await expect(reconciliarEcoDeEnvio(admin, scope)).resolves.toBeNull();
    expect(calls.some((call) => call.method === "update")).toBe(false);
  });

  it("não reconcilia direção não elegível, saída não API, mídia ou horário ausente", async () => {
    for (const altered of [
      { ...message, direction: "inbound" as const },
      { ...message, sentVia: "human" },
      { ...message, attachments: [{ type: "image", url: "https://example.test/image" }] },
      { ...message, sentAt: null },
      { ...message, status: "delivered" as const },
    ]) {
      const { admin, calls } = fakeAdmin([{ id: "ai-message-1" }]);
      await expect(
        reconciliarEcoDeEnvio(admin, { ...scope, message: altered }),
      ).resolves.toBeNull();
      expect(calls.some((call) => call.method === "update" || call.method === "select")).toBe(
        false,
      );
    }
  });

  it("não considera atualização concorrente concluída se o candidato já mudou", async () => {
    const { admin } = fakeAdmin([{ id: "ai-message-1" }], "");

    await expect(reconciliarEcoDeEnvio(admin, scope)).resolves.toBeNull();
  });
});
