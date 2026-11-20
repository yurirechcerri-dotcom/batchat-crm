/** Guarda real do turno + adapter Zernio real; banco, credenciais e rede falsos.
 * Mede revogação anterior ao POST, não cancela transporte já iniciado.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { guardServiceEffect, withServiceJob } from "@/lib/atendimento/fronteira-server";
import type { JobRow, Queryable } from "@/lib/agent-engine/queue/queue";
import { zernioAdapter } from "@/lib/channels/adapters/zernio";

const mocks = vi.hoisted(() => ({ credentials: vi.fn(), fetch: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/channels/zernio/credentials", () => ({ resolveZernioCreds: mocks.credentials }));

const boundary = {
  organization_id: "org-test",
  contact_id: "contact-test",
  conversation_id: "conversation-test",
  service_revision: 1,
  demanda_id: null,
  demanda_revision: null,
};
const job = {
  id: "job-test",
  organization_id: boundary.organization_id,
  contact_id: boundary.contact_id,
  kind: "inbound_turn",
  locked_by: "worker-test",
  claim_acquired_at: "2026-11-14T06:00:00Z",
  payload: { service_boundary: boundary },
} as unknown as JobRow;
const credentials = {
  accountId: "account-test",
  apiKey: "fake-test",
  baseUrl: "https://provider.test/api",
};

function world() {
  let current = true;
  const db = {
    query: async (sql: string) => ({
      rows: [
        sql.includes("from job_queue")
          ? { current }
          : { ...boundary, status: "open", demanda_fechada_em: null },
      ],
    }),
  } as unknown as Queryable;
  return {
    db,
    revoke: () => {
      current = false;
    },
  };
}
function send(kind: "text" | "audio") {
  return zernioAdapter.send({
    organizationId: boundary.organization_id,
    sessionRef: credentials.accountId,
    to: "synthetic-recipient",
    providerConversationId: "synthetic-thread",
    kind,
    body: "Mensagem sintética, sem transporte real",
    beforeSend: guardServiceEffect,
    ...(kind === "audio"
      ? {
          media: {
            url: "https://media.test/fake.ogg",
            mime: "audio/ogg",
            filename: "fake.ogg",
            caption: null,
          },
        }
      : {}),
  });
}
beforeEach(() => {
  mocks.credentials.mockReset().mockResolvedValue(credentials);
  mocks.fetch.mockReset().mockImplementation(
    async () =>
      new Response(
        JSON.stringify({
          success: true,
          data: { messageId: "wamid.synthetic" },
        }),
        { status: 200 },
      ),
  );
  vi.stubGlobal("fetch", mocks.fetch);
});
afterEach(() => vi.unstubAllGlobals());

describe("Zernio respeita revogação antes de transmitir", () => {
  it.each(["text", "audio"] as const)(
    "revogação durante preparo de %s impede POST e retry do turno",
    async (kind) => {
      const w = world();
      mocks.credentials.mockImplementation(async () => {
        await Promise.resolve();
        w.revoke();
        return credentials;
      });
      await expect(withServiceJob(w.db, job, () => send(kind))).rejects.toThrow(
        "service_boundary_stale",
      );
      await expect(withServiceJob(w.db, job, () => send(kind))).rejects.toThrow(
        "service_boundary_stale",
      );
      expect(mocks.credentials).toHaveBeenCalledTimes(1);
      expect(mocks.fetch).not.toHaveBeenCalled();
    },
  );
  it.each(["text", "audio"] as const)(
    "controle positivo de %s chega uma vez ao transporte simulado",
    async (kind) => {
      const w = world();
      await expect(withServiceJob(w.db, job, () => send(kind))).resolves.toEqual({
        externalId: "wamid.synthetic",
      });
      expect(mocks.fetch).toHaveBeenCalledTimes(1);
      expect(mocks.fetch).toHaveBeenCalledWith(
        "https://provider.test/api/v1/inbox/conversations/synthetic-thread/messages",
        expect.objectContaining({ method: "POST" }),
      );
    },
  );
});
