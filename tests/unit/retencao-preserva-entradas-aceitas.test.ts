// @vitest-environment node
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { podarArquivoDeWebhooks } from "@/lib/channels/retencao-do-arquivo";

type Linha = Record<string, unknown> & {
  id: string;
  received_at: string;
  status: string;
  valid_signature: boolean | null;
};

function evento(id: string, dias: number, status = "received", assinatura: boolean | null = true): Linha {
  return {
    id, status, valid_signature: assinatura,
    received_at: new Date(Date.now() - dias * 86_400_000).toISOString(),
    archived_at: null, raw_body: "corpo recuperavel",
    payload_parsed: { event: "message.received" }, headers: { "content-type": "application/json" },
  };
}

// Client Supabase real; somente o transporte HTTP/banco é substituído.
// O avaliador usa os operadores recebidos, não conhece a regra de elegibilidade.
function compara(valor: unknown, operador: string, esperado: string): boolean {
  if (operador === "is") return esperado === "null" ? valor === null : valor === (esperado === "true");
  if (valor === null || valor === undefined) return false;
  if (operador === "eq") return String(valor) === esperado;
  if (operador === "neq") return String(valor) !== esperado;
  if (operador === "lt") return String(valor) < esperado;
  if (operador === "lte") return String(valor) <= esperado;
  throw new Error(`Operador nao coberto: ${operador}`);
}

function banco(linhas: Linha[], antes?: (metodo: string) => void) {
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    expect(url.pathname).toBe("/rest/v1/webhook_events_log");
    const metodo = init?.method ?? "GET";
    antes?.(metodo);
    let alvos = linhas.filter((linha) => [...url.searchParams].every(([campo, filtro]) => {
      if (["select", "order", "limit"].includes(campo)) return true;
      if (campo === "or") {
        return filtro.slice(1, -1).split(",").some((termo) => {
          const [coluna, operador, ...valor] = termo.split(".");
          return compara(linha[coluna!], operador!, valor.join("."));
        });
      }
      const [operador, ...valor] = filtro.split(".");
      return compara(linha[campo], operador!, valor.join("."));
    }));
    const ordem = url.searchParams.get("order")?.split(".");
    if (ordem) alvos.sort((a, b) => String(a[ordem[0]!]).localeCompare(String(b[ordem[0]!])));
    const limite = url.searchParams.get("limit");
    if (limite) alvos = alvos.slice(0, Number(limite));
    if (metodo === "PATCH") alvos.forEach((linha) => Object.assign(linha, JSON.parse(String(init?.body))));
    else if (metodo === "DELETE") {
      alvos.forEach((linha) => linhas.splice(linhas.indexOf(linha), 1));
    } else expect(metodo).toBe("GET");
    const colunas = url.searchParams.get("select")!.split(",");
    return new Response(JSON.stringify(alvos.map((linha) =>
      Object.fromEntries(colunas.map((coluna) => [coluna, linha[coluna]])))), {
      status: 200, headers: { "content-type": "application/json" },
    });
  };
  return createClient("https://retencao.invalid", "chave-ficticia", {
    global: { fetch }, auth: { storageKey: randomUUID(), persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

const opcoes = { diasComCorpo: 7, diasParaApagar: 90 };
beforeEach(() => vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-11-14T00:00:00Z")));
afterEach(() => vi.restoreAllMocks());

describe("poda conserva a unica copia de uma entrada aceita ainda nao concluida", () => {
  it("preserva corpo e linha pendentes, inclusive alem do prazo de exclusao", async () => {
    const linhas = [evento("pendente", 10), evento("pendente-antigo", 100)];
    const esperado = structuredClone(linhas);
    expect(await podarArquivoDeWebhooks(banco(linhas), opcoes)).toEqual({
      esvaziadas: 0, apagadas: 0, temMais: false,
    });
    expect(linhas).toEqual(esperado);
  });

  it("continua podando eventos concluidos, recusados e sem assinatura aceita", async () => {
    const linhas = [
      evento("processado", 10, "processed"), evento("erro", 10, "error"),
      evento("recusado", 10, "received", false), evento("nao-verificado", 10, "received", null),
      evento("morto", 100, "dead"), evento("recente", 1, "processed"),
    ];
    expect(await podarArquivoDeWebhooks(banco(linhas), opcoes)).toEqual({
      esvaziadas: 5, apagadas: 1, temMais: false,
    });
    expect(linhas.map((linha) => linha.id)).toEqual(["processado", "erro", "recusado", "nao-verificado", "recente"]);
    expect(linhas.slice(0, 4).every((linha) => linha.raw_body === null && linha.archived_at !== null)).toBe(true);
    expect(linhas[4]?.raw_body).toBe("corpo recuperavel");
  });

  it("pendentes mais antigos nao ocupam o lote e impedem a limpeza de concluidos", async () => {
    const linhas = [evento("pendente", 30), evento("concluido", 20, "processed")];
    expect(await podarArquivoDeWebhooks(banco(linhas), { ...opcoes, lote: 1 })).toEqual({
      esvaziadas: 1, apagadas: 0, temMais: true,
    });
    expect(linhas[0]?.raw_body).toBe("corpo recuperavel");
    expect(linhas[1]?.raw_body).toBeNull();
  });

  it("reconfere elegibilidade ao esvaziar se assinatura for aceita depois da busca", async () => {
    const linha = evento("aceita-entre-busca-e-escrita", 10, "received", null);
    const admin = banco([linha], (metodo) => { if (metodo === "PATCH") linha.valid_signature = true; });
    expect((await podarArquivoDeWebhooks(admin, opcoes)).esvaziadas).toBe(0);
    expect(linha.raw_body).toBe("corpo recuperavel");
    expect(linha.archived_at).toBeNull();
  });

  it("reconfere elegibilidade ao excluir mesmo uma linha ja arquivada", async () => {
    const linha = { ...evento("aceita-antes-delete", 100, "received", null), archived_at: "2026-10-01" };
    const linhas = [linha];
    const admin = banco(linhas, (metodo) => { if (metodo === "DELETE") linha.valid_signature = true; });
    expect((await podarArquivoDeWebhooks(admin, opcoes)).apagadas).toBe(0);
    expect(linhas).toEqual([linha]);
  });

  it("volta a podar depois que o consumidor conclui o processamento", async () => {
    const linhas = [evento("pendente", 100)];
    const admin = banco(linhas);
    await podarArquivoDeWebhooks(admin, opcoes);
    expect(linhas).toHaveLength(1);
    linhas[0]!.status = "processed";
    expect(await podarArquivoDeWebhooks(admin, opcoes)).toEqual({ esvaziadas: 1, apagadas: 1, temMais: false });
    expect(linhas).toHaveLength(0);
  });
});
