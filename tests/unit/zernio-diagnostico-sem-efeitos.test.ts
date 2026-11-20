import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { lerEnvelopeZernio } from "@/lib/channels/zernio/envelope";
import { ingestZernioInbound } from "@/lib/channels/zernio/ingest";

describe("diagnóstico Zernio sem mensagem de cliente", () => {
  it("atravessa o contrato e o ingestor real sem acessar o banco", async () => {
    const reading = lerEnvelopeZernio(JSON.stringify({
      id: "provider-test-1",
      event: "webhook.test",
      message: "This is a test webhook from Zernio",
      timestamp: "2026-11-13T06:39:10.000Z",
    }));
    expect(reading.ok).toBe(true);
    if (!reading.ok) throw new Error("diagnóstico válido recusado");
    const db = new Proxy({} as SupabaseClient, {
      get() { throw new Error("diagnóstico não pode acessar o banco"); },
    });
    const result = await ingestZernioInbound(db, {
      organizationId: "org-test",
      channelSessionId: "session-test",
      payload: reading.envelope,
    });
    expect(result).toEqual({ status: "ignored", reason: "evento_sem_interesse" });
  });
});
