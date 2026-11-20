import { MAX_MESSAGE_MEDIA_BYTES } from "@/lib/messaging/media/types";

export const TIPOS_MIDIA_FLUXO: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
  "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/ogg": "ogg", "audio/opus": "ogg",
  "audio/wav": "wav", "audio/x-wav": "wav", "audio/mp4": "m4a", "audio/x-m4a": "m4a",
  "video/mp4": "mp4", "video/webm": "webm", "audio/webm": "webm",
};
export { MAX_MESSAGE_MEDIA_BYTES };

export function validarMidiaUpload(mime: string, tamanho: number): string | null {
  if (!Number.isSafeInteger(tamanho) || tamanho <= 0) return "Arquivo vazio ou inválido.";
  if (tamanho > MAX_MESSAGE_MEDIA_BYTES) return "O arquivo deve ter no máximo 15 MB.";
  if (!TIPOS_MIDIA_FLUXO[mime.split(";")[0]!.trim().toLowerCase()]) {
    return "Use JPG, PNG, WebP, GIF, MP3, OGG, WAV, M4A, MP4 ou WebM.";
  }
  return null;
}

/** Confere a assinatura do contêiner, sem confiar só no MIME do navegador. */
export function assinaturaDaMidiaConfere(bytes: Uint8Array, extensao: string): boolean {
  const texto = (inicio: number, fim: number) => String.fromCharCode(...bytes.slice(inicio, fim));
  if (bytes.length < 12) return false;
  switch (extensao) {
    case "jpg": return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    case "png": return [137,80,78,71,13,10,26,10].every((v,i) => bytes[i] === v);
    case "gif": return ["GIF87a", "GIF89a"].includes(texto(0,6));
    case "webp": return texto(0,4) === "RIFF" && texto(8,12) === "WEBP";
    case "wav": return texto(0,4) === "RIFF" && texto(8,12) === "WAVE";
    case "ogg": return texto(0,4) === "OggS";
    case "mp3": return texto(0,3) === "ID3" || (bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0);
    case "m4a": case "mp4": return texto(4,8) === "ftyp";
    case "webm": return [0x1a,0x45,0xdf,0xa3].every((v,i) => bytes[i] === v);
    default: return false;
  }
}
