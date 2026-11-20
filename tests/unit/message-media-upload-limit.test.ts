// @vitest-environment node
/**
 * POSTs reais, multipart/parser/validador e contador de body reais.
 * Só autorização, banco/storage e conversor são dublês. Bytes sintéticos;
 * nenhuma rede, execução de ffmpeg, mensagem ou credencial real.
 * O contrato de mensagem é decimal (15.000.000), independente da nota interna.
 */
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resolveAuthDual } from "@/lib/api/auth-dual";
import { transcodificarNotaDeVoz } from "@/lib/messaging/media/voice-transcode";
import { createAdminClient } from "@/lib/supabase/admin";
import { criarClienteAdminFalso } from "@/tests/unit/helpers/cliente-admin-falso";
import { POST as mensagem } from "@/app/api/v1/conversations/[id]/media/route";
import { POST as notaInterna } from "@/app/api/v1/conversations/[id]/notes/media/route";

vi.mock("@/lib/api/auth-dual", () => ({
  resolveAuthDual: vi.fn(), tetoDeEscritaDoToken: vi.fn(async () => null),
}));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn(async () => null) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/messaging/media/voice-transcode", () => ({ transcodificarNotaDeVoz: vi.fn() }));

const ORG = "22222222-2222-4222-8222-222222222222";
const CONVERSA = "33333333-3333-4333-8333-333333333333";
// Valores do requisito, sem importar a constante de produção que está sob teste.
const MAX_MENSAGEM = 15_000_000;
const MAX_CORPO = MAX_MENSAGEM + 1_048_576;
const MIME_FINAL = "audio/ogg;codecs=opus";
const ctx = { params: Promise.resolve({ id: CONVERSA }) };
const upload = vi.fn(async (_path: string, _bytes: Buffer, _opcoes: { contentType: string; upsert: boolean }) => ({ error: null }));
const bucket = vi.fn((_nome: string) => ({ upload }));
const rede = vi.fn(() => { throw new Error("Rede proibida no teste de upload"); });

function pedido(body: BodyInit, headers?: HeadersInit, interna = false): NextRequest {
  return new NextRequest(`http://localhost/api/v1/conversations/${CONVERSA}/${interna ? "notes/" : ""}media`, {
    method: "POST", headers, body,
    ...(body instanceof ReadableStream ? { duplex: "half" } : {}),
  });
}

function multipart(tamanho: number, mime = "audio/mp4", interna = false) {
  const form = new FormData();
  form.set("file", new File([new Uint8Array(tamanho)], "arquivo-sintetico", { type: mime }));
  if (!interna) form.set("nota_de_voz", "1");
  return pedido(form, undefined, interna);
}

async function recusado(res: Response, status = 413, code = "payload_too_large") {
  expect(res.status, await res.clone().text()).toBe(status);
  expect(await res.json()).toMatchObject({ error: { code } });
  expect(upload).not.toHaveBeenCalled();
  expect(createAdminClient).not.toHaveBeenCalled();
}

async function armazenado(res: Response, tamanho: number, mime: string, interna = false) {
  expect(res.status, await res.clone().text()).toBe(200);
  const corpo = await res.json() as {
    data: { storage_path: string; media_size_bytes: number; media_mime: string; kind: string };
  };
  expect(corpo.data).toMatchObject({ media_size_bytes: tamanho, media_mime: mime });
  expect(corpo.data.storage_path.startsWith(`${ORG}/${CONVERSA}/${interna ? "note" : "out"}-`)).toBe(true);
  expect(bucket).toHaveBeenCalledExactlyOnceWith(interna ? "internal-media" : "whatsapp-media");
  expect(upload).toHaveBeenCalledTimes(1);
  const envio = upload.mock.calls[0]!;
  expect(envio[0]).toBe(corpo.data.storage_path);
  expect(envio[1].length).toBe(tamanho);
  expect(envio[2]).toEqual({ contentType: mime, upsert: false });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", rede);
  const falso = criarClienteAdminFalso({
    orgDona: ORG, linhas: { conversations: [{ id: CONVERSA, organization_id: ORG }] },
    tabelasSemOrganizacao: [],
  });
  vi.mocked(resolveAuthDual).mockResolvedValue({
    ok: true, organizationId: ORG, idioma: "pt-BR", supabase: falso.cliente,
  } as never);
  vi.mocked(createAdminClient).mockReturnValue({ storage: { from: bucket } } as never);
  vi.mocked(transcodificarNotaDeVoz).mockReset();
  vi.mocked(transcodificarNotaDeVoz).mockImplementation(async ({ buffer, mime }) => ({
    buffer, mime, convertido: false,
  }));
});
afterEach(() => {
  try { expect(rede).not.toHaveBeenCalled(); }
  finally { vi.unstubAllGlobals(); }
});

describe("upload de mensagem: teto de 15.000.000 bytes", () => {
  it("original com um byte além do teto é recusado antes de converter ou criar storage", async () => {
    const req = multipart(MAX_MENSAGEM + 1);
    expect(req.headers.has("content-length")).toBe(false);
    await recusado(await mensagem(req, ctx));
    expect(transcodificarNotaDeVoz).not.toHaveBeenCalled();
  });

  it("conversão que cresce até teto + 1 é recusada antes do storage", async () => {
    vi.mocked(transcodificarNotaDeVoz).mockResolvedValueOnce({
      buffer: Buffer.alloc(MAX_MENSAGEM + 1), mime: MIME_FINAL, convertido: true,
    });
    await recusado(await mensagem(multipart(32), ctx));
    expect(transcodificarNotaDeVoz).toHaveBeenCalledTimes(1);
    expect(vi.mocked(transcodificarNotaDeVoz).mock.calls[0]?.[0].buffer.length).toBe(32);
  });

  it("original no teto exato aceita o overhead multipart e registra o tamanho armazenado", async () => {
    await armazenado(await mensagem(multipart(MAX_MENSAGEM), ctx), MAX_MENSAGEM, "audio/mp4");
    expect(transcodificarNotaDeVoz).toHaveBeenCalledTimes(1);
    expect(vi.mocked(transcodificarNotaDeVoz).mock.calls[0]?.[0].buffer.length).toBe(MAX_MENSAGEM);
  });

  it("conversão no teto exato retorna MIME e bytes finais, não os 32 bytes originais", async () => {
    vi.mocked(transcodificarNotaDeVoz).mockResolvedValueOnce({
      buffer: Buffer.alloc(MAX_MENSAGEM), mime: MIME_FINAL, convertido: true,
    });
    await armazenado(await mensagem(multipart(32), ctx), MAX_MENSAGEM, MIME_FINAL);
    expect(vi.mocked(transcodificarNotaDeVoz).mock.calls[0]?.[0]).toMatchObject({
      mime: "audio/mp4", notaDeVoz: true,
    });
  });

  it("body sem Content-Length para em 15 MB + overhead + 1, antes do parser/conversor/storage", async () => {
    let partesLidas = 0;
    const cancelado = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      pull(controle) {
        partesLidas += 1;
        if (partesLidas === 1) controle.enqueue(new Uint8Array(MAX_CORPO));
        else if (partesLidas === 2) controle.enqueue(new Uint8Array(1));
        else controle.close();
      },
      cancel: cancelado,
    }, { highWaterMark: 0 });
    const req = pedido(stream, { "content-type": "multipart/form-data; boundary=sintetico" });
    expect(req.headers.has("content-length")).toBe(false);
    // Não é multipart válido: o teto de bytes deve agir ANTES de tentar analisá-lo.
    await recusado(await mensagem(req, ctx));
    expect(partesLidas).toBe(2);
    expect(cancelado).toHaveBeenCalledTimes(1);
    expect(transcodificarNotaDeVoz).not.toHaveBeenCalled();
  });

  it("Content-Length acima do teto de body é recusado sem puxar o stream", async () => {
    const ler = vi.fn((controle: ReadableStreamDefaultController<Uint8Array>) => {
      controle.error(new Error("Não deveria ler este corpo"));
    });
    const stream = new ReadableStream<Uint8Array>({ pull: ler }, { highWaterMark: 0 });
    await recusado(await mensagem(pedido(stream, {
      "content-length": String(MAX_CORPO + 1), "content-type": "multipart/form-data; boundary=sintetico",
    }), ctx));
    expect(ler).not.toHaveBeenCalled();
    expect(transcodificarNotaDeVoz).not.toHaveBeenCalled();
  });

  it("erro ao ler body sem Content-Length devolve 400 sem conversão ou upload", async () => {
    const stream = new ReadableStream<Uint8Array>({
      pull(controle) { controle.error(new Error("Interrupção sintética do upload")); },
    }, { highWaterMark: 0 });
    const req = pedido(stream, { "content-type": "multipart/form-data; boundary=sintetico" });
    expect(req.headers.has("content-length")).toBe(false);
    await recusado(await mensagem(req, ctx), 400, "invalid_request");
    expect(transcodificarNotaDeVoz).not.toHaveBeenCalled();
  });
});

describe("nota interna mantém limite independente de 50 MiB", () => {
  it("nota de 16 MB continua aceita em internal-media e não passa pelo conversor", async () => {
    await armazenado(await notaInterna(multipart(16_000_000, "application/pdf", true), ctx),
      16_000_000, "application/pdf", true);
    expect(transcodificarNotaDeVoz).not.toHaveBeenCalled();
  });
});
