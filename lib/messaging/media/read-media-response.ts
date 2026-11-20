import { MediaTooLargeError } from "./types";

/** Content-Length antecipa a recusa; o contador do stream é a autoridade. */
export async function readMediaResponse(response: Response, maxBytes: number): Promise<Buffer> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new Error("invalid_media_limit");
  if (Number(response.headers.get("content-length") ?? 0) > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new MediaTooLargeError(maxBytes);
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("A mídia retornou um corpo vazio.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new MediaTooLargeError(maxBytes);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (!size) throw new Error("A mídia retornou um corpo vazio.");
  return Buffer.concat(chunks, size);
}
