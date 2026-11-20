import { MIME_DA_NOTA_DE_VOZ_OPUS } from "./formato";
import { ErroDoProvedorDeVoz } from "./erro-do-provedor";
import { modeloDeVozValido, modeloPadraoDaVoz } from "./provedor";
import type { SintetizarVozInput, SintetizarVozResultado } from "./sintetizar";

const LIMITE_DE_AUDIO = 15_000_000;
const TEMPO_MAXIMO_MS = 30_000;

/** Fish TTS v1: modelo no header, voz no reference_id; sem retry de síntese paga.
 * https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech
 */
export async function sintetizarFish(
  input: SintetizarVozInput,
  fetchImpl: typeof fetch,
): Promise<SintetizarVozResultado> {
  const model = input.modelId ?? modeloPadraoDaVoz("fish");
  if (!modeloDeVozValido("fish", model)) throw new Error("voice_model_invalid");
  if (!/^[a-f0-9]{32}$/i.test(input.voiceId)) throw new Error("voice_id_invalid");
  const opus = input.formato === "ogg_opus";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TEMPO_MAXIMO_MS);
  try {
    const res = await fetchImpl("https://api.fish.audio/v1/tts", {
      method: "POST",
      redirect: "error",
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "content-type": "application/json",
        model,
      },
      body: JSON.stringify({
        text: input.texto,
        reference_id: input.voiceId,
        format: opus ? "opus" : "mp3",
        ...(opus ? { opus_bitrate: 32000 } : { mp3_bitrate: 128 }),
        normalize: true,
      }),
    });
    if (!res.ok) {
      await res.body?.cancel();
      // Corpo remoto pode repetir texto/chave; a UI recebe um motivo local seguro.
      const motivo = res.status === 402 ? "Saldo insuficiente na API Fish Audio."
        : res.status === 401 || res.status === 403 ? "A credencial Fish Audio não autorizou a síntese."
        : res.status === 404 ? "A voz não foi encontrada no Fish Audio."
        : "Fish Audio não concluiu a síntese. Tente novamente mais tarde.";
      throw new ErroDoProvedorDeVoz(res.status, motivo);
    }
    if (Number(res.headers.get("content-length")) > LIMITE_DE_AUDIO || !res.body) {
      await res.body?.cancel();
      throw new Error("synthesis_audio_invalid");
    }
    const reader = res.body.getReader();
    const partes: Buffer[] = [];
    let tamanho = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        tamanho += value.byteLength;
        if (tamanho > LIMITE_DE_AUDIO) {
          await reader.cancel();
          throw new Error("synthesis_audio_too_large");
        }
        partes.push(Buffer.from(value));
      }
    } finally {
      reader.releaseLock();
    }
    const audio = Buffer.concat(partes);
    // Opus cru não é nota de voz. Exige cabeçalho Ogg + Opus mono antes do Storage.
    const opusHead = audio.indexOf("OpusHead");
    if (!audio.length || (opus && (audio.subarray(0, 4).toString() !== "OggS"
      || opusHead < 0 || audio[opusHead + 9] !== 1))) {
      throw new Error("synthesis_formato_inesperado");
    }
    if (!opus && !audio.subarray(0, 3).equals(Buffer.from("ID3"))
      && !(audio[0] === 0xff && (audio[1]! & 0xe0) === 0xe0)) {
      throw new Error("synthesis_formato_inesperado");
    }
    return {
      audio,
      mimeType: opus ? MIME_DA_NOTA_DE_VOZ_OPUS : "audio/mpeg",
      caracteres: input.texto.length,
      bytesDeTexto: Buffer.byteLength(input.texto, "utf8"),
    };
  } finally {
    clearTimeout(timer);
  }
}
