/**
 * O ADAPTADOR DA CAKTO da cobrança do revendedor (BatChat cobra as empresas).
 *
 * Por que a Cakto: é onde o Yuri já vende e recebe (Pix, cartão, boleto,
 * assinatura recorrente). A API pública dela (https://api.cakto.com.br/public_api)
 * é menor que a do Stripe/Asaas, e as diferenças moldam este arquivo:
 *
 * - CLIENTE = E-MAIL. Não existe "criar cliente" nem "criar sessão de checkout"
 *   por API: quem paga abre o link da oferta (`pay.cakto.com.br/<id>`) e a Cakto
 *   cria o cliente na compra. `garantirCliente` devolve o e-mail da empresa e a
 *   assinatura só aparece depois do pagamento. A documentação não registra
 *   preenchimento do e-mail pelo link: a tela precisa avisar "pague com o
 *   e-mail da sua conta".
 * - A SITUAÇÃO sai de `GET /subscriptions/?search=<email>`, filtrada aqui por
 *   e-mail EXATO e pelo produto dos planos do BatChat (o mesmo e-mail pode ter
 *   assinaturas de outros produtos do Yuri).
 * - SEM sandbox documentado: o modo é sempre `producao`.
 * - O cancelamento da Cakto é IMEDIATO (`POST /subscriptions/{id}/cancel/`),
 *   sem "no fim do período". `cancelarNoFim` recusa em vez de tirar do cliente
 *   o que ele já pagou; ele cancela pela Cakto. Troca de plano e ajuste
 *   proporcional também recusam (a API não aceita PUT/PATCH de assinatura).
 * - A chave são duas credenciais (`client_id` + `client_secret`) gravadas como
 *   `client_id:client_secret`; o token (`POST /token/`, vale 10 h) fica em
 *   memória e é renovado antes do fim.
 * - O webhook traz `{ secret, event, data }` e, às vezes, a assinatura
 *   `X-Cakto-Signature`. Ele só ACORDA a leitura (contrato §7c): quem decide é
 *   `lerSituacao`.
 * - Erros saem como `ErroDoProvedor` (status + código), nunca com URL, header ou corpo.
 */
import { createHash, randomBytes } from "node:crypto";

import { z } from "zod";

import { compradorDoEvento, origemValida, primeiroPedido } from "@/lib/cakto/webhook";

import {
  ErroDoProvedor,
  type AdaptadorDeCobranca,
  type Modo,
  type PlanoParaProvedor,
  type SinalDoWebhook,
  type Situacao,
} from "./contrato";

export const CAKTO_API_BASE = "https://api.cakto.com.br/public_api";
export const CAKTO_CHECKOUT_BASE = "https://pay.cakto.com.br";
/** O produto "BatChat (planos)" na conta da Cakto. */
export const CAKTO_PRODUTO_DOS_PLANOS = process.env.CAKTO_PRODUTO_DOS_PLANOS_ID ?? "produto-dos-planos";
/** O plano que só quem comprou o treinamento pode contratar (nome em `cobranca_planos`). */
export const NOME_DO_PLANO_ALUNO = "aluno";

export const EVENTOS_DO_WEBHOOK_CAKTO = [
  "purchase_approved",
  "purchase_refused",
  "refund",
  "chargeback",
  "subscription_created",
  "subscription_renewed",
  "subscription_canceled",
] as const;

const TENTATIVAS = 3;
const ESPERA_MAXIMA_MS = 5_000;
const MARGEM_DO_TOKEN_MS = 5 * 60_000;
const PAGINAS_MAXIMAS = 5;
const POR_PAGINA = 100;

/** Status que ainda cobram ou podem voltar a cobrar. O resto é terminal. */
const STATUS_VIVOS = new Set(["active", "trial", "late", "paused"]);

export interface DependenciasDaCakto {
  /** `client_id:client_secret`, lido A CADA uso. `null` = não configurada. */
  lerChave: () => Promise<string | null>;
  fetch?: typeof fetch;
  baseUrl?: string;
  produtoId?: string;
  esperar?: (ms: number) => Promise<void>;
  agora?: () => Date;
}

/** `client_id:client_secret` → partes; qualquer outra forma = `null`. */
export function partesDaChaveCakto(chave: string): { clientId: string; clientSecret: string } | null {
  const i = chave.indexOf(":");
  if (i <= 0 || i === chave.length - 1) return null;
  const clientId = chave.slice(0, i).trim();
  const clientSecret = chave.slice(i + 1).trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/** A Cakto não tem sandbox documentado: toda chave válida é de produção. */
export function modoDaChaveCakto(chave: string): Modo | null {
  return partesDaChaveCakto(chave) ? "producao" : null;
}

export function erroDaCakto(status: number): ErroDoProvedor {
  if (status === 401) return new ErroDoProvedor(401, "chave_invalida", false, true);
  if (status === 403) return new ErroDoProvedor(403, "sem_permissao", false, true);
  if (status === 429) return new ErroDoProvedor(429, "rate_limit", true);
  if (status >= 500) return new ErroDoProvedor(status, "provedor_fora", true);
  return new ErroDoProvedor(status, status === 404 ? "nao_encontrado" : "recusado", false);
}

function ler<T>(schema: z.ZodType<T>, dados: unknown): T {
  const lido = schema.safeParse(dados);
  if (!lido.success) throw new ErroDoProvedor(200, "resposta_invalida", false);
  return lido.data;
}

const comId = (v: unknown): string | null => {
  if (typeof v === "string" && v) return v;
  if (v && typeof v === "object" && typeof (v as { id?: unknown }).id === "string") return (v as { id: string }).id;
  return null;
};

const assinaturaDaCakto = z.object({
  id: z.string().min(1),
  status: z.string(),
  amount: z.union([z.number(), z.string()]).nullish(),
  customer: z.unknown().optional(),
  offer: z.unknown().optional(),
  product: z.unknown().optional(),
  next_payment_date: z.string().nullish(),
  paid_payments_quantity: z.number().nullish(),
  createdAt: z.string().nullish(),
});
type AssinaturaDaCakto = z.infer<typeof assinaturaDaCakto>;

const paginaDeAssinaturas = z.object({
  results: z.array(z.unknown()),
  next: z.string().nullish(),
});

const ofertaDaCakto = z.object({
  id: z.string().min(1),
  name: z.string().nullish(),
  price: z.union([z.number(), z.string()]),
  status: z.string(),
});
type OfertaDaCakto = z.infer<typeof ofertaDaCakto>;

const centavos = (v: number | string | null | undefined): number | null => {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};

const emailDoCliente = (c: unknown): string | null => {
  if (c && typeof c === "object" && typeof (c as { email?: unknown }).email === "string") {
    return (c as { email: string }).email.trim().toLowerCase();
  }
  return null;
};

const data = (s: string | null | undefined): Date | null => {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

const maisRecenteDepois = (a: AssinaturaDaCakto, b: AssinaturaDaCakto) =>
  (data(b.createdAt)?.getTime() ?? 0) - (data(a.createdAt)?.getTime() ?? 0);

/**
 * Valida o webhook (assinatura OU `secret` do corpo) e devolve só o ponteiro.
 * Origem certa + forma estranha vira ponteiro SEM empresa, com id estável pelo
 * conteúdo: recusar faria a Cakto reenviar sem fim.
 */
export function verificarWebhookCakto(corpoCru: string, headers: Headers, segredo: string, agora?: Date): SinalDoWebhook | null {
  let json: unknown = null;
  try {
    json = JSON.parse(corpoCru);
  } catch {
    json = null;
  }
  const bruto = json !== null && typeof json === "object" ? (json as Record<string, unknown>) : {};
  // Duas provas de origem, ambas com o MESMO segredo: a assinatura do cabeçalho
  // (formato documentado) OU o `secret` do corpo, que a Cakto também envia. Só a
  // primeira recusava o aviso inteiro quando o cabeçalho vinha num formato que
  // não conferimos; o `secret` do corpo é o fallback documentado dela.
  const valido =
    origemValida({
      corpoCru,
      timestamp: headers.get("x-cakto-timestamp"),
      assinatura: headers.get("x-cakto-signature"),
      secretDoCorpo: bruto.secret,
      segredo,
      agora: agora?.getTime(),
    }) ||
    origemValida({ corpoCru, timestamp: null, assinatura: null, secretDoCorpo: bruto.secret, segredo });
  if (!valido) return null;
  const tipo = typeof bruto.event === "string" && /^[a-z_]{1,64}$/.test(bruto.event) ? bruto.event : "desconhecido";
  const pedido = primeiroPedido(bruto.data);
  const idDoPedido = pedido && typeof pedido.id === "string" ? pedido.id : null;
  const email = compradorDoEvento(bruto.data).email?.toLowerCase() ?? null;
  const resumo = createHash("sha256").update(corpoCru, "utf8").digest("hex").slice(0, 40);
  return {
    eventoId: idDoPedido ? `${tipo}:${idDoPedido}` : `forma:${resumo}`,
    tipo,
    clienteRef: email,
  };
}

export type AdaptadorDaCakto = AdaptadorDeCobranca & {
  /** Há pedido PAGO deste e-mail em produto da conta que NÃO seja o dos planos? Reembolso e chargeback não contam. */
  compradorDoTreinamento(email: string): Promise<boolean>;
};

export function criarAdaptadorCakto(dep: DependenciasDaCakto): AdaptadorDaCakto {
  const buscar = dep.fetch ?? fetch;
  const base = dep.baseUrl ?? CAKTO_API_BASE;
  const produtoId = dep.produtoId ?? CAKTO_PRODUTO_DOS_PLANOS;
  const esperar = dep.esperar ?? ((ms: number) => new Promise<void>((pronto) => setTimeout(pronto, ms)));
  const agora = dep.agora ?? (() => new Date());
  let token: { valor: string; expiraEm: number } | null = null;

  async function tentar(fazer: () => Promise<Response>, repetivel: boolean): Promise<Response> {
    let ultimo: unknown;
    for (let t = 1; t <= TENTATIVAS; t++) {
      try {
        const r = await fazer();
        if ((r.status === 429 || r.status >= 500) && repetivel && t < TENTATIVAS) {
          await esperar(Math.min(500 * 2 ** (t - 1), ESPERA_MAXIMA_MS));
          continue;
        }
        return r;
      } catch (e) {
        ultimo = e;
        if (!repetivel || t === TENTATIVAS) break;
        await esperar(Math.min(500 * 2 ** (t - 1), ESPERA_MAXIMA_MS));
      }
    }
    void ultimo;
    throw new ErroDoProvedor(null, "sem_resposta", true);
  }

  async function obterToken(): Promise<string> {
    if (token && token.expiraEm - MARGEM_DO_TOKEN_MS > agora().getTime()) return token.valor;
    const chave = await dep.lerChave();
    const partes = chave ? partesDaChaveCakto(chave) : null;
    if (!partes) throw new ErroDoProvedor(null, "chave_ausente", false, true);
    const corpo = new URLSearchParams({ client_id: partes.clientId, client_secret: partes.clientSecret });
    const r = await tentar(
      () =>
        buscar(`${base}/token/`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
          body: corpo,
        }),
      true,
    );
    if (r.status === 400 || r.status === 401) throw new ErroDoProvedor(r.status, "chave_invalida", false, true);
    if (!r.ok) throw erroDaCakto(r.status);
    const { access_token, expires_in } = ler(
      z.object({ access_token: z.string().min(1), expires_in: z.number().optional() }),
      await r.json().catch(() => null),
    );
    token = { valor: access_token, expiraEm: agora().getTime() + (expires_in ?? 36_000) * 1000 };
    return access_token;
  }

  async function chamar(metodo: "GET" | "POST", caminho: string): Promise<unknown> {
    const resposta = await tentar(
      async () =>
        buscar(`${base}${caminho}`, {
          method: metodo,
          headers: { Authorization: `Bearer ${await obterToken()}`, Accept: "application/json" },
        }),
      metodo === "GET",
    );
    if (resposta.status === 401) token = null;
    if (!resposta.ok) throw erroDaCakto(resposta.status);
    return resposta.json().catch(() => {
      throw new ErroDoProvedor(resposta.status, "resposta_invalida", false);
    });
  }

  /** Assinaturas deste e-mail, só do produto dos planos. */
  async function assinaturasDe(email: string): Promise<AssinaturaDaCakto[]> {
    const alvo = email.trim().toLowerCase();
    const achadas: AssinaturaDaCakto[] = [];
    for (let pagina = 1; pagina <= PAGINAS_MAXIMAS; pagina++) {
      const q = new URLSearchParams({ search: alvo, limit: String(POR_PAGINA), page: String(pagina) });
      const lida = ler(paginaDeAssinaturas, await chamar("GET", `/subscriptions/?${q.toString()}`));
      for (const bruto of lida.results) {
        const s = ler(assinaturaDaCakto, bruto);
        if (emailDoCliente(s.customer) !== alvo) continue;
        const doProduto = comId(s.product);
        if (doProduto !== null && doProduto !== produtoId) continue;
        achadas.push(s);
      }
      if (!lida.next) break;
    }
    return achadas;
  }

  async function ofertaDoPlano(plano: PlanoParaProvedor): Promise<OfertaDaCakto> {
    const lida = ler(
      z.object({ results: z.array(ofertaDaCakto) }),
      await chamar("GET", `/offers/?product=${encodeURIComponent(produtoId)}`),
    );
    const doPreco = lida.results.filter((o) => centavos(o.price) === plano.precoCents);
    const oferta =
      doPreco.find((o) => (o.name ?? "").trim().toLowerCase() === plano.nome.trim().toLowerCase()) ?? doPreco[0];
    if (!oferta) throw new ErroDoProvedor(404, "oferta_nao_encontrada", false);
    if (oferta.status !== "active") throw new ErroDoProvedor(409, "oferta_desativada", false);
    return oferta;
  }

  const pedidoDoTreinamento = z.object({
    status: z.string(),
    customer: z.unknown().optional(),
    product: z.unknown().optional(),
  });

  async function compradorDoTreinamento(email: string): Promise<boolean> {
    const alvo = email.trim().toLowerCase();
    if (!alvo) return false;
    for (let pagina = 1; pagina <= PAGINAS_MAXIMAS; pagina++) {
      const q = new URLSearchParams({ search: alvo, status: "paid", limit: String(POR_PAGINA), page: String(pagina) });
      const lida = ler(paginaDeAssinaturas, await chamar("GET", `/orders/?${q.toString()}`));
      for (const bruto of lida.results) {
        const p = ler(pedidoDoTreinamento, bruto);
        if (p.status !== "paid" || emailDoCliente(p.customer) !== alvo) continue;
        const doProduto = comId(p.product);
        if (doProduto !== null && doProduto !== produtoId) return true;
      }
      if (!lida.next) break;
    }
    return false;
  }

  const naoSuportado = () => new ErroDoProvedor(null, "nao_suportado_pela_cakto", false);

  return {
    id: "cakto",

    async testarChave(opcoes) {
      if (opcoes?.modoExigido === "teste") return { ok: false, motivo: "modo_divergente", modo: "producao" };
      try {
        token = null;
        await obterToken();
        await chamar("GET", "/offers/?limit=1");
        return { ok: true, modo: "producao" };
      } catch (e) {
        if (e instanceof ErroDoProvedor) {
          if (e.status === 403) return { ok: false, motivo: "sem_permissao" };
          if (e.credencialInvalida) return { ok: false, motivo: "chave_invalida" };
        }
        return { ok: false, motivo: "provedor_fora" };
      }
    },

    // A Cakto cria o webhook no painel dela; aqui nasce o segredo que ela vai
    // devolver no corpo de cada aviso.
    async prepararWebhook(url) {
      return { manual: { url, segredo: randomBytes(24).toString("hex"), eventos: [...EVENTOS_DO_WEBHOOK_CAKTO] } };
    },

    async removerWebhooks() {
      return 0;
    },

    async clienteExiste(clienteRef) {
      return (await assinaturasDe(clienteRef)).length > 0;
    },

    verificarWebhook: verificarWebhookCakto,

    async garantirCliente(org) {
      const email = org.email.trim().toLowerCase();
      if (!email) throw new ErroDoProvedor(null, "email_ausente", false);
      return email;
    },

    compradorDoTreinamento,

    async iniciarAssinatura({ plano, clienteRef }) {
      if (plano.nome.trim().toLowerCase() === NOME_DO_PLANO_ALUNO && !(await compradorDoTreinamento(clienteRef))) {
        throw new ErroDoProvedor(403, "so_para_alunos", false);
      }
      const oferta = await ofertaDoPlano(plano);
      return { url: `${CAKTO_CHECKOUT_BASE}/${oferta.id}`, expiraEm: null, assinaturaRef: null, sessaoId: null };
    },

    async iniciarAjusteProporcional() {
      throw naoSuportado();
    },

    async lerPagamentoProporcional() {
      throw naoSuportado();
    },

    async lerSituacao({ clienteRef }): Promise<Situacao> {
      const todas = (await assinaturasDe(clienteRef)).sort(maisRecenteDepois);
      const vivas = todas.filter((s) => STATUS_VIVOS.has(s.status));
      const principal = vivas[0] ?? todas[0] ?? null;
      const pagas = (s: AssinaturaDaCakto) => (s.paid_payments_quantity ?? 0) > 0;
      return {
        assinaturaRef: principal?.id ?? null,
        existe: principal !== null && STATUS_VIVOS.has(principal.status) && (pagas(principal) || principal.status === "trial"),
        assinaturasVivas: vivas.length,
        cancelada: vivas.length === 0 && principal !== null,
        cancelaNoFim: false,
        emAtraso: principal?.status === "late",
        vencidaDesde: null,
        proximoVencimento: data(principal?.next_payment_date),
        periodoPagoDesde: null,
        jaPagou: todas.some(pagas),
        emTesteNoProvedorAte: null,
        pagamentoSemAssinaturaViva: false,
        linkDePagamento: null,
        precoCents: principal ? centavos(principal.amount) : null,
        statusBruto: principal?.status ?? "sem_assinatura",
      };
    },

    async trocarPlano() {
      throw naoSuportado();
    },

    // Não há sessão a expirar: o link da oferta não carrega preço por cliente.
    async expirarSessao() {},

    async cancelarNoFim() {
      throw naoSuportado();
    },

    async urlDeGerenciar() {
      return null;
    },
  };
}
