// @vitest-environment node
/**
 * Executa a mutationFn REAL registrada pelo hook. React Query é só a captura;
 * não prova render, toast, retries ou estado do composer. File/FormData reais,
 * fetch substituído por observador: nenhum transporte ou storage é acessado.
 */
import { createHash } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useUploadMedia, type UploadedMedia } from "@/hooks/inbox/useUploadMedia";
import { ApiError } from "@/lib/api/types";

type Args = Parameters<ReturnType<typeof useUploadMedia>["mutateAsync"]>[0];
type Mutacao = (args: Args) => Promise<UploadedMedia>;
const captura = vi.hoisted(() => ({ mutationFn: undefined as Mutacao | undefined }));
vi.mock("@tanstack/react-query", () => ({
  useMutation: (opcoes: { mutationFn: Mutacao }) => {
    captura.mutationFn = opcoes.mutationFn;
    return {};
  },
}));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));

const CONVERSA = "33333333-3333-4333-8333-333333333333";
// Requisito decimal, independente da constante de produção sob teste.
const MAX_MENSAGEM = 15_000_000;
const rede = vi.fn<typeof fetch>();

function arquivo(tamanho: number, mime = "audio/mp4") {
  const bytes = new Uint8Array(tamanho);
  bytes.set([1, 7, 19, 41]);
  bytes[tamanho - 1] = 127;
  return new File([bytes], "arquivo-sintetico.m4a", { type: mime, lastModified: 123_456 });
}
const hash = async (file: File) => createHash("sha256").update(Buffer.from(await file.arrayBuffer())).digest("hex");

function CapturarUpload() {
  useUploadMedia();
  return null;
}

function mutacao() {
  renderToStaticMarkup(createElement(CapturarUpload));
  if (!captura.mutationFn) throw new Error("O hook não registrou mutationFn");
  return captura.mutationFn;
}

beforeEach(() => {
  captura.mutationFn = undefined;
  rede.mockReset();
  rede.mockImplementation(async (_url, init) => {
    if (!(init?.body instanceof FormData)) throw new Error("Esperado multipart real");
    const file = init.body.get("file");
    if (!(file instanceof File)) throw new Error("Esperado File no multipart");
    return Response.json({ data: {
      storage_path: `org-sintetica/${CONVERSA}/arquivo`, media_mime: file.type,
      media_size_bytes: file.size, kind: file.type.startsWith("audio/") ? "audio" : "document",
    } });
  });
  vi.stubGlobal("fetch", rede);
});
afterEach(() => vi.unstubAllGlobals());

describe("useUploadMedia: tamanho validado antes da rede", () => {
  it("mensagem padrão com 15 MB + 1 rejeita com ApiError 413, sem fetch e sem modificar o File", async () => {
    const file = arquivo(MAX_MENSAGEM + 1);
    const antes = await hash(file);
    const args: Args = { conversationId: CONVERSA, file, notaDeVoz: true };
    const resultado = await mutacao()(args).then(valor => valor, erro => erro as unknown);

    // Soft também observa rede/arquivo no RED; um status incorreto não esconde
    // que o hook enviou justamente o arquivo que devia recusar localmente.
    expect.soft(resultado).toBeInstanceOf(ApiError);
    expect.soft(resultado).toMatchObject({ status: 413, code: "payload_too_large" });
    expect.soft(rede).not.toHaveBeenCalled();
    expect(args.file).toBe(file);
    expect(file).toMatchObject({ size: MAX_MENSAGEM + 1, name: "arquivo-sintetico.m4a", type: "audio/mp4", lastModified: 123_456 });
    expect(await hash(file)).toBe(antes);
  });

  it("mensagem no teto exato chama fetch com multipart e preserva a marca de nota de voz", async () => {
    const file = arquivo(MAX_MENSAGEM);
    const resultado = await mutacao()({ conversationId: CONVERSA, file, destino: "mensagem", notaDeVoz: true });

    expect(rede).toHaveBeenCalledTimes(1);
    const [url, init] = rede.mock.calls[0]!;
    expect(url).toBe(`/api/v1/conversations/${CONVERSA}/media`);
    expect(init?.method).toBe("POST");
    const form = init?.body as FormData;
    expect(form.get("nota_de_voz")).toBe("1");
    const enviado = form.get("file") as File;
    expect(enviado.size).toBe(MAX_MENSAGEM);
    expect(enviado.name).toBe(file.name);
    expect(resultado).toMatchObject({ media_size_bytes: MAX_MENSAGEM, media_mime: "audio/mp4", kind: "audio" });
  });

  it("nota interna de 16 MB continua indo a notes/media", async () => {
    const file = arquivo(16_000_000, "application/pdf");
    const resultado = await mutacao()({ conversationId: CONVERSA, file, filename: "nota.pdf", destino: "nota" });

    expect(rede).toHaveBeenCalledTimes(1);
    const [url, init] = rede.mock.calls[0]!;
    expect(url).toBe(`/api/v1/conversations/${CONVERSA}/notes/media`);
    expect(init?.method).toBe("POST");
    const form = init?.body as FormData;
    expect(form.get("nota_de_voz")).toBeNull();
    const enviado = form.get("file") as File;
    expect(enviado.size).toBe(16_000_000);
    expect(enviado.name).toBe("nota.pdf");
    expect(resultado).toMatchObject({ media_size_bytes: 16_000_000, media_mime: "application/pdf", kind: "document" });
  });
});
