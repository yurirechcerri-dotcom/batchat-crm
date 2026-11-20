import { describe, expect, it, vi } from "vitest";
import { sintetizarVoz } from "./sintetizar";
import { custoFishCents, provedorDeVoz } from "./provedor";
import { decidirBinding } from "@/lib/ai/pontos/resolver";

const input = { provider: "fish" as const, apiKey: "only-this-org", voiceId: "a".repeat(32), texto: "Olá, ação!" };
const mp3 = new Uint8Array([0x49, 0x44, 0x33, 0, 1, 2]);

describe("Fish TTS no caminho nativo", () => {
  it("usa credencial e voz escolhidas, modelo no header e cobrança UTF-8", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(mp3));
    const result = await sintetizarVoz(input, fetcher);
    const [url, opts] = fetcher.mock.calls[0]!;
    expect(url).toBe("https://api.fish.audio/v1/tts");
    expect(opts).toMatchObject({ method: "POST", redirect: "error", headers: {
      Authorization: "Bearer only-this-org", model: "s2.1-pro",
    } });
    expect(JSON.parse(String(opts?.body))).toEqual({ text: input.texto, reference_id: input.voiceId,
      format: "mp3", mp3_bitrate: 128, normalize: true });
    expect(result.bytesDeTexto).toBe(Buffer.byteLength(input.texto));
    expect(result.bytesDeTexto).toBeGreaterThan(result.caracteres);
    expect(result.mimeType).toBe("audio/mpeg");
    expect(custoFishCents(1_000_000, "s2.1-pro")).toBe(1500);
  });

  it("recebe Ogg/Opus mono, recusa opus cru ou estéreo", async () => {
    const mono = Buffer.concat([Buffer.from("OggS"), Buffer.alloc(24), Buffer.from("OpusHead"), Buffer.from([1, 1])]);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(mono));
    const result = await sintetizarVoz({ ...input, formato: "ogg_opus" }, fetcher);
    expect(result.mimeType).toBe("audio/ogg;codecs=opus");
    expect(JSON.parse(String(fetcher.mock.calls[0]![1]?.body))).toMatchObject({ format: "opus", opus_bitrate: 32000 });
    mono[mono.length - 1] = 2;
    for (const bytes of [mono, Buffer.from("rawopus"), Buffer.from("OggS")]) {
      await expect(sintetizarVoz({ ...input, formato: "ogg_opus" },
        vi.fn<typeof fetch>().mockResolvedValue(new Response(bytes)))).rejects.toThrow("synthesis_formato_inesperado");
    }
  });

  it.each([401, 402, 429, 500])("recusa %i sem retry ou exposição do corpo remoto", async (status) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("secret echoed here", { status }));
    let error: unknown;
    try { await sintetizarVoz(input, fetcher); } catch (err) { error = err; }
    expect(error).toMatchObject({ status, message: `synthesis_${status}` });
    expect(JSON.stringify(error)).not.toContain("secret echoed here");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("recusa modelo desconhecido/ID legado antes de chamar API", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(sintetizarVoz({ ...input, modelId: "eleven_multilingual_v2" }, fetcher)).rejects.toThrow("voice_model_invalid");
    await expect(sintetizarVoz({ ...input, voiceId: "voz-antiga" }, fetcher)).rejects.toThrow("voice_id_invalid");
    expect(fetcher).not.toHaveBeenCalled();
    expect(() => custoFishCents(NaN, "s2.1-pro")).toThrow("voice_usage_invalid");
    expect(() => provedorDeVoz("openai")).toThrow("voice_provider_unknown");
    expect(provedorDeVoz(undefined)).toBe("elevenlabs");
  });

  it("recusa mídia não áudio e resposta acima do teto sem Storage/envio", async () => {
    for (const response of [new Response("<html>error</html>"), new Response(mp3, { headers: { "content-length": "15000001" } })]) {
      await expect(sintetizarVoz(input, vi.fn<typeof fetch>().mockResolvedValue(response))).rejects.toThrow();
    }
  });

  it("interrompe leitura por tamanho real mesmo sem Content-Length", async () => {
    let cancelled = false;
    const stream = new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(15_000_001)); },
      cancel() { cancelled = true; },
    });
    await expect(sintetizarVoz(input, vi.fn<typeof fetch>().mockResolvedValue(new Response(stream))))
      .rejects.toThrow("synthesis_audio_too_large");
    expect(cancelled).toBe(true);
  });

  it("o painel anuncia o TTS selecionado em vez do modelo de chat", () => {
    const result = decidirBinding({ pontoId: "sintese_de_voz", binding: null, agentePublicado: null,
      modeloDeAmbiente: undefined, padraoDaOrganizacao: { provider: "openai", defaultModel: "gpt-5" },
      voz: { provider: "fish", model_id: "s2.1-pro" } });
    expect(result).toMatchObject({ provider: "fish", modelId: "s2.1-pro" });
  });
});
