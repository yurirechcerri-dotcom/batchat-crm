import { describe, expect, it, vi } from "vitest";
import { registrarCustoDeVoz } from "@/lib/agent-engine/edge/crm/send-voice";

describe("uso de voz da organização", () => {
  it("grava Fish/bytes/execução sem chamar isso de tokens ou ElevenLabs", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn(() => ({ insert }));
    registrarCustoDeVoz({ supabase: { from } as never, organizationId: "org-a", jobId: "job-a",
      provider: "fish", modelId: "s2.1-pro", caracteres: 3, bytesDeTexto: 5 });
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    expect(from).toHaveBeenCalledWith("llm_calls");
    expect(insert).toHaveBeenCalledWith({ organization_id: "org-a", job_id: "job-a",
      purpose: "sintese_de_voz", provider: "fish", model: "s2.1-pro", input_tokens: 0,
      output_tokens: 0, cost_cents: 0.0075 });
  });
});
