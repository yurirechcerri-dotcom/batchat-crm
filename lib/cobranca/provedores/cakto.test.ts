import { describe, expect, it, vi } from "vitest";

import { CAKTO_PRODUTO_DOS_PLANOS, criarAdaptadorCakto, modoDaChaveCakto, partesDaChaveCakto, verificarWebhookCakto } from "./cakto";
import { ErroDoProvedor } from "./contrato";

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });

function montar(rotas: (url: URL, init?: RequestInit) => Response | null) {
  const chamadas: string[] = [];
  const fetchFalso = vi.fn(async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(entrada));
    chamadas.push(`${init?.method ?? "GET"} ${url.pathname}${url.search}`);
    if (url.pathname.endsWith("/token/")) return json({ access_token: "tok", expires_in: 36000 });
    return rotas(url, init) ?? json({ detail: "x" }, 404);
  });
  const adaptador = criarAdaptadorCakto({
    lerChave: async () => "id123:segredo456",
    fetch: fetchFalso as unknown as typeof fetch,
    esperar: async () => {},
    agora: () => new Date("2026-11-18T12:00:00Z"),
  });
  return { adaptador, chamadas, fetchFalso };
}

const sub = (extra: Record<string, unknown> = {}) => ({
  id: "sub-1",
  status: "active",
  amount: 97,
  customer: { email: "Dono@Empresa.com" },
  product: { id: CAKTO_PRODUTO_DOS_PLANOS },
  next_payment_date: "2026-12-18T00:00:00Z",
  paid_payments_quantity: 1,
  createdAt: "2026-11-18T10:00:00Z",
  ...extra,
});

describe("chave da Cakto", () => {
  it("separa client_id e client_secret; qualquer outra forma é recusada", () => {
    expect(partesDaChaveCakto("abc:def:ghi")).toEqual({ clientId: "abc", clientSecret: "def:ghi" });
    expect(partesDaChaveCakto("semdoispontos")).toBeNull();
    expect(partesDaChaveCakto(":x")).toBeNull();
    expect(partesDaChaveCakto("x:")).toBeNull();
  });
  it("não tem sandbox: toda chave válida é de produção", () => {
    expect(modoDaChaveCakto("a:b")).toBe("producao");
    expect(modoDaChaveCakto("lixo")).toBeNull();
  });
});

describe("webhook da Cakto", () => {
  const corpo = JSON.stringify({
    secret: "segredo-do-aviso",
    event: "purchase_approved",
    data: { id: "ped-1", customer: { email: "Dono@Empresa.com" } },
  });
  it("aceita o secret do corpo e devolve só o ponteiro, com o e-mail em minúsculas", () => {
    expect(verificarWebhookCakto(corpo, new Headers(), "segredo-do-aviso")).toEqual({
      eventoId: "purchase_approved:ped-1",
      tipo: "purchase_approved",
      clienteRef: "dono@empresa.com",
    });
  });
  it("cabeçalho de assinatura em formato desconhecido não derruba o aviso se o secret do corpo confere", () => {
    const h = new Headers({ "x-cakto-signature": "formato-que-nao-conferimos", "x-cakto-timestamp": "1" });
    expect(verificarWebhookCakto(corpo, h, "segredo-do-aviso")?.tipo).toBe("purchase_approved");
    expect(verificarWebhookCakto(corpo, h, "outro")).toBeNull();
  });
  it("recusa secret errado e corpo sem secret", () => {
    expect(verificarWebhookCakto(corpo, new Headers(), "outro")).toBeNull();
    expect(verificarWebhookCakto(JSON.stringify({ event: "x" }), new Headers(), "segredo-do-aviso")).toBeNull();
  });
  it("origem certa e forma estranha vira ponteiro sem empresa, com id estável", () => {
    const estranho = JSON.stringify({ secret: "s", event: "Evento Estranho!!" });
    const a = verificarWebhookCakto(estranho, new Headers(), "s");
    const b = verificarWebhookCakto(estranho, new Headers(), "s");
    expect(a).toEqual(b);
    expect(a).toMatchObject({ tipo: "desconhecido", clienteRef: null });
    expect(a?.eventoId.startsWith("forma:")).toBe(true);
  });
});

describe("lerSituacao", () => {
  it("lê só assinaturas do e-mail exato e do produto dos planos", async () => {
    const { adaptador } = montar((url) =>
      url.pathname.endsWith("/subscriptions/")
        ? json({
            results: [
              sub(),
              sub({ id: "sub-outro-email", customer: { email: "outro@x.com" } }),
              sub({ id: "sub-outro-produto", product: { id: "treinamento" } }),
            ],
            next: null,
          })
        : null,
    );
    const s = await adaptador.lerSituacao({ clienteRef: "dono@empresa.com" });
    expect(s).toMatchObject({
      assinaturaRef: "sub-1",
      existe: true,
      assinaturasVivas: 1,
      cancelada: false,
      emAtraso: false,
      jaPagou: true,
      precoCents: 9700,
      statusBruto: "active",
    });
    expect(s.proximoVencimento?.toISOString()).toBe("2026-12-18T00:00:00.000Z");
  });

  it("late = em atraso; cancelada sem viva = cancelada; sem nada = não existe", async () => {
    const atraso = montar(() => json({ results: [sub({ status: "late" })], next: null }));
    expect(await atraso.adaptador.lerSituacao({ clienteRef: "dono@empresa.com" })).toMatchObject({ existe: true, emAtraso: true });

    const cancelada = montar(() => json({ results: [sub({ status: "canceled" })], next: null }));
    expect(await cancelada.adaptador.lerSituacao({ clienteRef: "dono@empresa.com" })).toMatchObject({
      existe: false,
      cancelada: true,
      assinaturasVivas: 0,
      jaPagou: true,
    });

    const nada = montar(() => json({ results: [], next: null }));
    expect(await nada.adaptador.lerSituacao({ clienteRef: "dono@empresa.com" })).toMatchObject({
      assinaturaRef: null,
      existe: false,
      cancelada: false,
      statusBruto: "sem_assinatura",
    });
  });

  it("duas vivas contam como cobrança dupla; a principal é a mais recente", async () => {
    const { adaptador } = montar(() =>
      json({ results: [sub({ id: "velha", createdAt: "2026-10-01T00:00:00Z" }), sub({ id: "nova" })], next: null }),
    );
    const s = await adaptador.lerSituacao({ clienteRef: "dono@empresa.com" });
    expect(s.assinaturasVivas).toBe(2);
    expect(s.assinaturaRef).toBe("nova");
  });

  it("primeira cobrança ainda não paga: viva, mas ainda não 'existe'", async () => {
    const { adaptador } = montar(() => json({ results: [sub({ paid_payments_quantity: 0 })], next: null }));
    expect(await adaptador.lerSituacao({ clienteRef: "dono@empresa.com" })).toMatchObject({ existe: false, assinaturasVivas: 1, jaPagou: false });
  });

  it("forma inesperada vira ErroDoProvedor, nunca ZodError", async () => {
    const { adaptador } = montar(() => json({ results: [{ sem: "id" }], next: null }));
    await expect(adaptador.lerSituacao({ clienteRef: "dono@empresa.com" })).rejects.toBeInstanceOf(ErroDoProvedor);
  });

  it("pede o token uma vez só e reaproveita", async () => {
    const { adaptador, chamadas } = montar(() => json({ results: [], next: null }));
    await adaptador.lerSituacao({ clienteRef: "a@a.com" });
    await adaptador.lerSituacao({ clienteRef: "b@b.com" });
    expect(chamadas.filter((c) => c.includes("/token/"))).toHaveLength(1);
  });
});

describe("iniciarAssinatura", () => {
  const ofertas = (status: string) =>
    json({ results: [{ id: "ofertaaluno", name: "Aluno", price: 47, status }, { id: "ofertapro01", name: "Pro", price: 97, status }] });
  const plano = { id: "p", nome: "Pro", precoCents: 9700, intervalo: "mensal" } as never;

  it("devolve o link da oferta que tem o preço do plano", async () => {
    const { adaptador } = montar(() => ofertas("active"));
    const r = await adaptador.iniciarAssinatura({ clienteRef: "x@x.com", orgId: "o", plano, trialAte: null, urlDeVolta: "https://a", chaveIdempotencia: "k" });
    expect(r).toEqual({ url: "https://pay.cakto.com.br/ofertapro01", expiraEm: null, assinaturaRef: null, sessaoId: null });
  });

  it("oferta desativada não vira link de venda", async () => {
    const { adaptador } = montar(() => ofertas("disabled"));
    await expect(
      adaptador.iniciarAssinatura({ clienteRef: "x@x.com", orgId: "o", plano, trialAte: null, urlDeVolta: "https://a", chaveIdempotencia: "k" }),
    ).rejects.toMatchObject({ codigo: "oferta_desativada" });
  });

  it("preço sem oferta correspondente falha", async () => {
    const { adaptador } = montar(() => ofertas("active"));
    await expect(
      adaptador.iniciarAssinatura({ clienteRef: "x@x.com", orgId: "o", plano: { ...(plano as object), precoCents: 12300 } as never, trialAte: null, urlDeVolta: "https://a", chaveIdempotencia: "k" }),
    ).rejects.toMatchObject({ codigo: "oferta_nao_encontrada" });
  });
});

describe("plano Aluno", () => {
  const aluno = { id: "p", nome: "Aluno", precoCents: 4700, intervalo: "mensal" } as never;
  const ofertas = json({ results: [{ id: "ofertaaluno", name: "Aluno", price: 47, status: "active" }] });
  const pedido = (extra: Record<string, unknown> = {}) => ({
    status: "paid",
    customer: { email: "Aluno@x.com" },
    product: { id: "treinamento" },
    ...extra,
  });
  const iniciar = (a: ReturnType<typeof montar>["adaptador"]) =>
    a.iniciarAssinatura({ clienteRef: "aluno@x.com", orgId: "o", plano: aluno, trialAte: null, urlDeVolta: "https://a", chaveIdempotencia: "k" });

  it("quem comprou o treinamento (pedido pago, outro produto, mesmo e-mail) contrata", async () => {
    const { adaptador } = montar((url) =>
      url.pathname.endsWith("/orders/") ? json({ results: [pedido()], next: null }) : ofertas,
    );
    expect((await iniciar(adaptador)).url).toBe("https://pay.cakto.com.br/ofertaaluno");
  });

  it("sem pedido do treinamento, ou só de outro e-mail, ou só do próprio plano: recusa", async () => {
    for (const results of [
      [],
      [pedido({ customer: { email: "outro@x.com" } })],
      [pedido({ product: { id: CAKTO_PRODUTO_DOS_PLANOS } })],
    ]) {
      const { adaptador } = montar((url) => (url.pathname.endsWith("/orders/") ? json({ results, next: null }) : ofertas));
      await expect(iniciar(adaptador)).rejects.toMatchObject({ codigo: "so_para_alunos", transitorio: false });
    }
  });

  it("o plano Pro não consulta pedidos", async () => {
    const { adaptador, chamadas } = montar(() => json({ results: [{ id: "ofertapro01", name: "Pro", price: 97, status: "active" }] }));
    await adaptador.iniciarAssinatura({ clienteRef: "x@x.com", orgId: "o", plano: { id: "p", nome: "Pro", precoCents: 9700, intervalo: "mensal" } as never, trialAte: null, urlDeVolta: "https://a", chaveIdempotencia: "k" });
    expect(chamadas.some((c) => c.includes("/orders/"))).toBe(false);
  });
});

describe("o que a Cakto não faz", () => {
  it("recusa troca de plano, ajuste proporcional e cancelamento no fim do período", async () => {
    const { adaptador } = montar(() => null);
    await expect(adaptador.cancelarNoFim("s")).rejects.toMatchObject({ codigo: "nao_suportado_pela_cakto", transitorio: false });
    await expect(adaptador.trocarPlano({ assinaturaRef: "s", plano: {} as never })).rejects.toBeInstanceOf(ErroDoProvedor);
    await expect(adaptador.iniciarAjusteProporcional({} as never)).rejects.toBeInstanceOf(ErroDoProvedor);
  });
});

describe("testarChave", () => {
  it("chave boa: ok em produção; recusa o modo teste sem chamar a API", async () => {
    const { adaptador, fetchFalso } = montar(() => json({ results: [] }));
    expect(await adaptador.testarChave()).toEqual({ ok: true, modo: "producao" });
    fetchFalso.mockClear();
    expect(await adaptador.testarChave({ modoExigido: "teste" })).toEqual({ ok: false, motivo: "modo_divergente", modo: "producao" });
    expect(fetchFalso).not.toHaveBeenCalled();
  });
  it("token recusado = chave inválida", async () => {
    const adaptador = criarAdaptadorCakto({
      lerChave: async () => "a:b",
      fetch: (async () => json({ error: "invalid_client" }, 401)) as unknown as typeof fetch,
      esperar: async () => {},
    });
    expect(await adaptador.testarChave()).toEqual({ ok: false, motivo: "chave_invalida" });
  });
});
