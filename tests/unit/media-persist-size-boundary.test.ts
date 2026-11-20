import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MAX_MESSAGE_MEDIA_BYTES, MediaTooLargeError } from "@/lib/messaging/media/types";

const state = vi.hoisted(() => ({
  message: {} as Record<string, unknown>,
  writeError: false,
  fetchMedia: vi.fn(), upload: vi.fn(), rpc: vi.fn(), remove: vi.fn(),
  reads: [] as Array<{ table: string; filters: Array<[string, unknown]> }>,
  writes: [] as Array<Record<string, unknown>>,
}));
type Result = { data: Record<string, unknown> | Array<{ id: string }> | null; error: { message: string } | null };
interface Query extends PromiseLike<Result> {
  eq(column: string, value: unknown): Query;
  filter(column: string, operator: string, value: unknown): Query;
  select(): Query;
  maybeSingle(): Promise<Result>;
}
function query(table: string, patch?: Record<string, unknown>): Query {
  const filters: Array<[string, unknown]> = [];
  let distinct: unknown;
  const execute = async (): Promise<Result> => {
    if (patch) {
      if (state.writeError) return { data: null, error: { message: "db unavailable" } };
      const matches = filters.every(([k, v]) => state.message[k] === v) && state.message.body !== distinct;
      if (matches) { state.writes.push(patch); Object.assign(state.message, patch); }
      return { data: matches ? [{ id: "message-1" }] : [], error: null };
    }
    state.reads.push({ table, filters: [...filters] });
    const data = table === "messages" ? { ...state.message, metadata: { ...state.message.metadata as object } }
      : table === "channel_sessions" ? { provider: "zernio", zernio_account_id: "account-1" }
        : table === "conversations" ? { is_group: false } : null;
    if (!data) throw new Error(`unexpected table ${table}`);
    return { data, error: null };
  };
  const q: Query = {
    eq: (k, v) => { filters.push([k, v]); return q; },
    filter: (k, op, v) => {
      if (k !== "body" || op !== "isdistinct") throw new Error("unexpected guard");
      distinct = v; return q;
    },
    select: () => q, maybeSingle: execute,
    then: (resolve, reject) => execute().then(resolve, reject),
  };
  return q;
}
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({
  from: (table: string) => ({ select: () => query(table), update: (patch: Record<string, unknown>) => query(table, patch) }),
  storage: { from: (bucket: string) => {
    expect(bucket).toBe("whatsapp-media");
    return { upload: state.upload, remove: state.remove };
  } }, rpc: state.rpc,
}) }));
vi.mock("@/lib/channels", () => ({
  CHANNEL_SESSION_REF_COLUMNS: "zernio_account_id", DEFAULT_CHANNEL_PROVIDER: "waha",
  getAdapter: () => ({ fetchInboundMedia: state.fetchMedia }),
  resolveSessionRef: (row: { zernio_account_id: string }) => row.zernio_account_id,
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/env", () => ({ env: { MEDIA_VISION_WITHOUT_READER: "always" } }));

import { persistMessageMedia } from "@/workers/media-persist-worker";

const event = {
  id: "event-1", organization_id: "org-1", entity_id: "message-1", entity_kind: "message",
  event_type: "media.persist_requested", payload: { message_id: "message-1" },
  metadata: {}, consumed_by: [], attempts: 0,
};
const network = vi.fn(() => { throw new Error("external network forbidden"); });
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal("fetch", network);
  state.message = {
    id: "message-1", organization_id: "org-1", conversation_id: "conversation-1",
    channel_session_id: "session-1", type: "document", body: null,
    media_url: "https://media.example.test/document", media_mime: "application/pdf",
    media_storage_path: null, metadata: { source: "synthetic" },
  };
  state.reads = []; state.writes = []; state.writeError = false;
  state.fetchMedia.mockReset().mockResolvedValue({ buffer: Buffer.from("pdf"), mime: "application/pdf" });
  state.upload.mockResolvedValue({ error: null }); state.rpc.mockResolvedValue({ error: null });
});
afterEach(() => { expect(network).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });
function noStorageOrDerivation() {
  expect(state.upload).not.toHaveBeenCalled(); expect(state.rpc).not.toHaveBeenCalled();
}

describe("message persistence measures bytes before Storage", () => {
  it("accepts the exact decimal cap and preserves tenant/session/object identity", async () => {
    const buffer = Buffer.alloc(MAX_MESSAGE_MEDIA_BYTES);
    state.fetchMedia.mockResolvedValue({ buffer, mime: "application/pdf" });
    expect(await persistMessageMedia(event)).toMatchObject({ status: "ok" });
    expect(state.fetchMedia).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org-1", sessionRef: "account-1" }));
    expect(state.upload.mock.calls[0]?.[0]).toBe("org-1/conversation-1/message-1.pdf");
    expect(state.upload.mock.calls[0]?.[1]).toBe(buffer);
    expect(state.message.media_size_bytes).toBe(MAX_MESSAGE_MEDIA_BYTES);
    expect(state.rpc).toHaveBeenCalledWith("emit_event", expect.objectContaining({
      p_event_type: "media.derive_requested", p_organization_id: "org-1", p_entity_id: "message-1",
    }));
    for (const read of state.reads) expect(read.filters).toContainEqual(["organization_id", "org-1"]);
  });

  it.each(["buffer", "adapter"] as const)("rejects %s overflow on first attempt, and repeated event does not redownload", async source => {
    if (source === "buffer") state.fetchMedia.mockResolvedValue({ buffer: Buffer.alloc(MAX_MESSAGE_MEDIA_BYTES + 1), mime: "application/pdf" });
    else state.fetchMedia.mockRejectedValue(new MediaTooLargeError(MAX_MESSAGE_MEDIA_BYTES));
    expect(await persistMessageMedia(event)).toMatchObject({ status: "skipped", detail: "media_too_large" });
    noStorageOrDerivation();
    expect(state.message).toMatchObject({ media_storage_path: null, media_derived_status: "failed", metadata: {
      source: "synthetic", media_status: "failed", media_rejection_code: "payload_too_large",
    } });
    expect(await persistMessageMedia(event)).toMatchObject({ status: "skipped", detail: "media_too_large" });
    expect(state.fetchMedia).toHaveBeenCalledTimes(1); expect(state.writes).toHaveLength(1);
  });

  it("keeps a failed rejection write recoverable, then records it on retry", async () => {
    state.fetchMedia.mockRejectedValue(new MediaTooLargeError(MAX_MESSAGE_MEDIA_BYTES));
    state.writeError = true;
    await expect(persistMessageMedia(event)).rejects.toThrow("message update failed");
    expect(state.writes).toHaveLength(0); noStorageOrDerivation();
    state.writeError = false;
    expect(await persistMessageMedia(event)).toMatchObject({ status: "skipped", detail: "media_too_large" });
    expect(state.writes).toHaveLength(1);
  });

  it("does not restore metadata erased while download was in progress", async () => {
    state.fetchMedia.mockImplementation(async () => {
      Object.assign(state.message, { body: "[mensagem anonimizada]", metadata: {}, media_url: null });
      throw new MediaTooLargeError(MAX_MESSAGE_MEDIA_BYTES);
    });
    expect(await persistMessageMedia(event)).toMatchObject({ status: "skipped", detail: "message_redacted" });
    expect(state.message.metadata).toEqual({}); expect(state.writes).toHaveLength(0); noStorageOrDerivation();
  });

  it("retains transient download retries without a permanent rejection marker", async () => {
    state.fetchMedia.mockRejectedValue(new Error("provider temporarily unavailable"));
    expect(await persistMessageMedia(event)).toMatchObject({ status: "error" });
    expect(state.writes).toHaveLength(0); noStorageOrDerivation();
    state.fetchMedia.mockResolvedValue({ buffer: Buffer.from("pdf"), mime: "application/pdf" });
    expect(await persistMessageMedia({ ...event, attempts: 1 })).toMatchObject({ status: "ok" });
  });
});
