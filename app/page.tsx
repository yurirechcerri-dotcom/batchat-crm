import { Fragment, type CSSProperties } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";

import "./landing.css";
import { RevelarAoRolar } from "./_revelar-ao-rolar";
import { LogoInterativa } from "@/components/branding/LogoInterativa";
import {
  ArrowRight,
  CalendarBlank,
  ChatCircle,
  Check,
  Checks,
  Clock,
  GraduationCap,
  InstagramLogo,
  Lightning,
  Robot,
  Sparkle,
  TreeStructure,
  UsersThree,
  WhatsappLogo,
  X,
} from "@/lib/ui/icons";

import { marcaDaSaida } from "@/lib/branding/saida";
import { idiomaDoVisitante } from "@/lib/i18n/idiomaAnonimo";
import { traduzir } from "@/lib/i18n/dicionario";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Página inicial pública. Abre pela dor, mostra o produto de verdade e só promete o que o BatChat faz
 * hoje: nada de número de cliente, depoimento ou métrica inventada. Pouco texto, formatos variados.
 * O <h1> é o nome da marca (a verificação do Google e o SEO leem o endereço principal); a frase grande
 * do hero é um <h2>. O editor de fluxos é a prancha 07 do sistema de design, redesenhada em HTML.
 */
// WhatsApp Business do BatChat, para quem é aluno mas não conseguiu liberar o plano pelo e-mail.
/** WhatsApp de suporte (só dígitos, com DDI+DDD). Defina NEXT_PUBLIC_WHATSAPP_DE_SUPORTE. */
const WHATSAPP_DE_SUPORTE = process.env.NEXT_PUBLIC_WHATSAPP_DE_SUPORTE ?? "";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/app");

  const marca = await marcaDaSaida(null);
  const idioma = await idiomaDoVisitante(null);
  const t = (texto: string) => traduzir(texto, idioma);

  const trocas = [t("venda"), t("cliente"), t("agendamento"), t("lead")];

  const dores = [
    { hora: "22:47", texto: t("Cliente pergunta o preço e ninguém vê.") },
    { hora: "D+2", texto: t("O follow-up ficou na memória de alguém.") },
    { hora: "3 chips", texto: t("Cada atendente com um pedaço da conversa.") },
    { hora: "??", texto: t("Lead sem etapa, perdido numa planilha.") },
  ];


  // Funil 3D: anéis e malha calculados aqui, desenhados em SVG (sem imagem, sem biblioteca).
  const RX = (y: number) => 190 - (190 - 34) * ((y - 70) / 260);
  const aneis = [70, 130, 190, 250, 310].map((y) => ({ y, rx: RX(y), ry: RX(y) * 0.18 }));
  const angulos = Array.from({ length: 12 }, (_, i) => (i * Math.PI * 2) / 12);
  const topo = (a: number): [number, number] => [210 + 190 * Math.cos(a), 70 + 34 * Math.sin(a)];
  const pescoco = (a: number): [number, number] => [210 + 34 * Math.cos(a), 330 + 6 * Math.sin(a)];
  const malha = angulos.flatMap((a, i) => {
    const [x1, y1] = topo(a);
    const [x2, y2] = pescoco(a);
    const [x3, y3] = pescoco(angulos[(i + 1) % 12] ?? 0);
    const frente = Math.sin(a) >= 0;
    return [
      { d: `M${x1.toFixed(1)} ${y1.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)}`, frente },
      { d: `M${x1.toFixed(1)} ${y1.toFixed(1)} L${x3.toFixed(1)} ${y3.toFixed(1)}`, frente },
    ];
  });
  const particulas = Array.from({ length: 16 }, (_, i) => {
    const x = 60 + ((i * 97) % 300);
    return { x, y: 40 + ((i * 53) % 50), dx: Math.round((210 - x) * 0.82), atraso: (i * 0.55).toFixed(2), r: 1.6 + (i % 3) * 0.7 };
  });
  const clientesFunil = [
    { nome: "Carla", topo: 19 },
    { nome: "Ana", topo: 36 },
    { nome: "Bruno", topo: 53 },
    { nome: "Marcos", topo: 79 },
  ];
  const eventosAgenda: { col: number; lin: number; alt: number; nome: string; novo?: boolean; tom?: string }[] = [
    { col: 1, lin: 2, alt: 1, nome: "Rafael", tom: "a" }, { col: 1, lin: 3, alt: 2, nome: "Beatriz", tom: "b" },
    { col: 1, lin: 5, alt: 1, nome: "Thiago", tom: "c" }, { col: 1, lin: 6, alt: 2, nome: "Mônica", tom: "a" },
    { col: 1, lin: 8, alt: 2, nome: "Eduardo", tom: "b" },
    { col: 2, lin: 2, alt: 2, nome: "Camila", tom: "c" }, { col: 2, lin: 4, alt: 1, nome: "Lucas", tom: "a" },
    { col: 2, lin: 5, alt: 2, nome: "Fernanda", tom: "b" }, { col: 2, lin: 7, alt: 1, nome: "Rodrigo", tom: "c" },
    { col: 2, lin: 8, alt: 1, nome: "Aline", tom: "a" }, { col: 2, lin: 9, alt: 1, nome: "Vitor", tom: "b" },
    { col: 3, lin: 2, alt: 1, nome: "Mariana", tom: "c" }, { col: 3, lin: 3, alt: 1, nome: "Henrique", tom: "b" },
    { col: 3, lin: 4, alt: 1, nome: "Otávio", tom: "a" }, { col: 3, lin: 5, alt: 2, nome: "Larissa", novo: true },
    { col: 3, lin: 7, alt: 1, nome: "Diego", tom: "a" }, { col: 3, lin: 8, alt: 2, nome: "Natália", tom: "c" },
    { col: 4, lin: 2, alt: 2, nome: "Patrícia", tom: "b" }, { col: 4, lin: 4, alt: 1, nome: "Gustavo", tom: "c" },
    { col: 4, lin: 5, alt: 2, nome: "Juliana", tom: "a" }, { col: 4, lin: 7, alt: 1, nome: "Leandro", tom: "b" },
    { col: 4, lin: 8, alt: 1, nome: "Priscila", tom: "c" }, { col: 4, lin: 9, alt: 1, nome: "Caio", tom: "a" },
    { col: 5, lin: 2, alt: 1, nome: "Bruno", tom: "a" }, { col: 5, lin: 3, alt: 2, nome: "Carolina", tom: "c" },
    { col: 5, lin: 5, alt: 1, nome: "Felipe", tom: "b" }, { col: 5, lin: 6, alt: 2, nome: "Isabela", tom: "a" },
    { col: 5, lin: 8, alt: 1, nome: "Matheus", tom: "c" }, { col: 5, lin: 9, alt: 1, nome: "Yasmin", tom: "b" },
  ];
  const horaDe = (lin: number) => `${String(lin + 7).padStart(2, "0")}:00`;
  const tiposDoDia = [t("Call"), t("Demo"), t("Retorno"), t("Call"), t("Proposta"), t("Retorno"), t("Demo"), t("Call")];
  const diaLista = eventosAgenda.filter((e) => e.col === 3).sort((x, y) => x.lin - y.lin);
  const etapas = [t("Novo"), t("Quente"), t("Call marcada"), t("Fechado")];

  const passos = [t("Conecte seus canais"), t("Escolha quem atende"), t("Deixe o follow-up rodar"), t("Acompanhe até fechar")];

  // Planos decididos em 18/11/2026. Os tetos de canal/atendente/agente espelham `cobranca_planos`.
  const planos = [
    {
      id: "aluno",
      nome: t("Aluno"),
      Icone: GraduationCap,
      preco: 47,
      de: 97,
      selo: t("Exclusivo Bat Academy"),
      nota: t("Para quem é aluno da Bat Academy. Conferimos pelo e-mail da sua compra."),
      herda: null as string | null,
      itens: [
        t("1 número de WhatsApp e 1 Instagram"),
        t("1 atendente"),
        t("1 agente de IA"),
        t("Fluxos e respostas por palavra-chave"),
        t("Uma caixa de entrada para todas as conversas"),
      ],
      cta: t("Sou aluno da Bat Academy"),
      ajuda: true,
      destaque: false,
    },
    {
      id: "pro",
      nome: t("Pro"),
      Icone: Lightning,
      preco: 97,
      de: null as number | null,
      selo: t("Mais escolhido"),
      nota: t("Para quem atende todo dia e precisa de mais braços."),
      herda: t("Tudo do plano Aluno") as string | null,
      itens: [
        t("Até 3 canais, entre WhatsApp e Instagram"),
        t("Até 3 atendentes"),
        t("Até 3 agentes de IA"),
        t("Follow-ups para retomar quem sumiu"),
      ],
      cta: t("Começar no Pro"),
      ajuda: false,
      destaque: true,
    },
    {
      id: "equipe",
      nome: t("Equipe"),
      Icone: UsersThree,
      preco: 197,
      de: null as number | null,
      selo: null as string | null,
      nota: t("Para a operação com várias pessoas e várias frentes."),
      herda: t("Tudo do plano Pro") as string | null,
      itens: [
        t("Até 10 canais"),
        t("Até 10 atendentes"),
        t("Agentes de IA sem limite de quantidade"),
        t("Webhooks e API para integrar com o resto"),
        t("Desempenho por atendente"),
      ],
      cta: t("Começar na Equipe"),
      ajuda: false,
      destaque: false,
    },
  ];

  const perguntas = [
    {
      p: t("O que é o {marca}?").replace("{marca}", marca.nome),
      r: t("Uma plataforma de atendimento e vendas: reúne as conversas de WhatsApp e Instagram, agentes de inteligência artificial, fluxos de mensagens, funil de vendas e agenda em um só lugar."),
    },
    {
      p: t("A IA responde sozinha o tempo todo?"),
      r: t("Só onde a empresa liga. Quando a conversa pede uma pessoa (preço, negociação, pedido de atendente), o agente passa para a equipe e a IA fica em silêncio naquela conversa."),
    },
    {
      p: t("Preciso saber programar para criar os fluxos?"),
      r: t("Não. Os fluxos são montados no editor visual, com mensagens, esperas e lembretes ligados por setas."),
    },
    {
      p: t("Como entro?"),
      r: t("Com e-mail e senha ou com a conta Google, pela tela de entrada."),
    },
  ];

  return (
    <div className="bc-landing">
      <RevelarAoRolar />
      <div className="bc-l-holofote" aria-hidden="true" />
      <div className="bc-l-fundo" aria-hidden="true">
        <i className="bc-l-cone" />
        <i className="bc-l-grade" />
        <i className="bc-l-ruido" />
      </div>

      <header className="bc-l-top">
        <div className="bc-l-pill">
          <Link href="/" className="bc-l-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/batchat-simbolo.svg" alt="" width={38} height={26} />
            {marca.nome}
          </Link>
          <nav className="bc-l-nav" aria-label={t("Seções")}>
            <a href="#dor">{t("O problema")}</a>
            <a href="#fluxos">{t("Fluxos")}</a>
            <a href="#recursos">{t("Recursos")}</a>
            <a href="#planos">{t("Planos")}</a>
            <a href="#perguntas">{t("Perguntas")}</a>
          </nav>
          <div className="bc-l-top-cta">
            <Link href="/login" className="bc-l-link">
              {t("Entrar")}
            </Link>
            <Link href="/signup" className="bc-l-btn bc-l-btn--main bc-l-btn--sm">
              {t("Criar conta")}
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* ───────── Hero ───────── */}
        <section className="bc-l-hero">
          <div className="bc-l-wrap bc-l-hero-in">
            <LogoInterativa />
            <h1 className="bc-l-marca">{marca.nome}</h1>
            <h2 className="bc-l-fala">
              {t("Pare de perder")}{" "}
              <span className="bc-l-troca" aria-hidden="true">
                {trocas.map((v) => (
                  <b key={v}>{v}</b>
                ))}
              </span>
              <span className="bc-l-sr">{trocas[0]}</span>
              <br />
              {t("por demora no WhatsApp.")}
            </h2>
            <p className="bc-l-lead">
              {t("Atendimento e vendas pelo WhatsApp, com agentes de inteligência artificial.")}
            </p>
            <div className="bc-l-cta">
              <Link href="/signup" className="bc-l-btn bc-l-btn--main bc-l-btn--lg">
                {t("Criar conta")} <ArrowRight size={16} aria-hidden />
              </Link>
              <a href="#fluxos" className="bc-l-btn bc-l-btn--lg">
                {t("Ver como funciona")}
              </a>
            </div>
          </div>

          <div className="bc-l-wrap">
            <div className="bc-l-palco">
              <div className="bc-l-janela bc-l-rev" aria-hidden="true">
                <div className="bc-l-barra">
                  <i /> <i /> <i />
                  <span>{t("Exemplo ilustrativo")}</span>
                </div>
                <div className="bc-l-janela-corpo">
                  <div className="bc-l-col bc-l-col--lista">
                    <div className="bc-l-chips">
                      <b className="on">{t("Todas")}</b>
                      <b>{t("Minhas")}</b>
                      <b>{t("Não lidas")}</b>
                    </div>
                    <div className="bc-l-item bc-l-item--on">
                      <span className="bc-l-av">AL</span>
                      <div>
                        <strong>Ana Lima</strong>
                        <small><InstagramLogo size={11} aria-hidden /> Instagram</small>
                        <p>{t("Quero receber o guia.")}</p>
                      </div>
                      <time>14:32</time>
                    </div>
                    <div className="bc-l-item bc-l-item--novo">
                      <span className="bc-l-av">BR</span>
                      <div>
                        <strong>Bruno Reis</strong>
                        <small><WhatsappLogo size={11} aria-hidden /> WhatsApp</small>
                        <p>{t("Podemos marcar uma call?")}</p>
                      </div>
                      <time>13:58</time>
                      <em>1</em>
                    </div>
                    <div className="bc-l-item">
                      <span className="bc-l-av">CS</span>
                      <div>
                        <strong>Carla Souza</strong>
                        <small><WhatsappLogo size={11} aria-hidden /> WhatsApp</small>
                        <p>{t("Obrigada pelo material!")}</p>
                      </div>
                      <time>12:10</time>
                    </div>
                  </div>

                  <div className="bc-l-col bc-l-col--chat">
                    <div className="bc-l-chat-topo">
                      <span className="bc-l-av bc-l-av--anel">AL</span>
                      <div>
                        <strong>Ana Lima</strong>
                        <small>{t("Instagram · conversa no direct")}</small>
                      </div>
                      <span className="bc-l-resolver"><Check size={12} aria-hidden /> {t("Resolver")}</span>
                    </div>
                    <div className="bc-l-chat">
                      <div className="bc-l-msg bc-l-msg--in">
                        <small>Ana Lima · 14:28</small>
                        {t("Oi! Vi o post e comentei GUIA.")}
                      </div>
                      <div className="bc-l-msg bc-l-msg--bot">
                        <small><Robot size={11} aria-hidden /> {t("Agente de IA")} · 14:28</small>
                        {t("Oi, Ana! Quer receber o guia de vendas?")}
                      </div>
                      <div className="bc-l-msg bc-l-msg--in">
                        <small>Ana Lima · 14:29</small>
                        {t("Quero sim. Pode mandar o preço também?")}
                      </div>
                      <div className="bc-l-passou">
                        <UsersThree size={13} aria-hidden /> {t("Pediu preço: passou para a equipe. IA em silêncio.")}
                      </div>
                      <div className="bc-l-msg bc-l-msg--out">
                        <small>Bruno Reis · {t("Equipe")} · 14:31</small>
                        {t("Claro, Ana! Segue o material.")} <Checks size={12} aria-hidden />
                      </div>
                      <div className="bc-l-digita" aria-hidden="true"><i /><i /><i /></div>
                    </div>
                  </div>

                  <div className="bc-l-col bc-l-col--contato">
                    <small className="bc-l-rotulo">{t("Contato")}</small>
                    <div className="bc-l-contato">
                      <span className="bc-l-av bc-l-av--anel bc-l-av--g">AL</span>
                      <strong>Ana Lima</strong>
                      <small>{t("Online agora")}</small>
                    </div>
                    <small className="bc-l-rotulo">{t("Tags")}</small>
                    <div className="bc-l-tags">
                      <b>{t("Pediu o guia")}</b>
                      <b className="mudo">{t("Lead quente")}</b>
                    </div>
                    <small className="bc-l-rotulo">{t("Funil")}</small>
                    <div className="bc-l-etapa"><i /> {t("Quente")}</div>
                    <small className="bc-l-rotulo">{t("Automação ativa")}</small>
                    <div className="bc-l-etapa bc-l-etapa--auto"><Lightning size={13} aria-hidden /> {t("Guia no direct")}</div>
                  </div>
                </div>
                <i className="bc-l-varre" />
              </div>

              <div className="bc-l-flutua bc-l-flutua--a" aria-hidden="true">
                <span className="bc-l-flutua-ico"><Clock size={16} /></span>
                <div>
                  <strong>{t("Follow-up em 5 h")}</strong>
                  <small>{t("Para se ela responder.")}</small>
                </div>
              </div>
              <div className="bc-l-flutua bc-l-flutua--b" aria-hidden="true">
                <span className="bc-l-flutua-ico"><Sparkle size={16} /></span>
                <div>
                  <strong>{t("Lead quente")}</strong>
                  <small>{t("Moveu para Quente")}</small>
                </div>
              </div>
              <div className="bc-l-flutua bc-l-flutua--c" aria-hidden="true">
                <span className="bc-l-flutua-ico"><CalendarBlank size={16} /></span>
                <div>
                  <strong>{t("Call marcada")}</strong>
                  <small>{t("Amanhã, 15h")}</small>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ───────── A dor: quatro cenas, quatro desenhos ───────── */}
        <section className="bc-l-sec bc-l-sec--compacta" id="dor" aria-labelledby="dor-titulo">
          <div className="bc-l-wrap">
            <p className="bc-l-eyebrow bc-l-rev">{t("O problema")}</p>
            <h2 id="dor-titulo" className="bc-l-rev">
              {t("Você não perde venda por falta de cliente. Perde na conversa.")}
            </h2>
            <div className="bc-l-dores4">
              <article className="bc-l-cena bc-l-rev">
                <div className="bc-l-cena-arte bc-l-arte-noite" aria-hidden="true">
                  <div className="bc-l-notif"><b>João Maciel</b><span>{t("Qual o valor?")}</span><time>22:47</time></div>
                  <div className="bc-l-notif bc-l-notif--2"><b>{t("Cliente novo")}</b><span>{t("Tem horário amanhã?")}</span><time>23:10</time></div>
                  <div className="bc-l-relogio"><Clock size={14} /> 09:03 <em>{t("fechou com outro")}</em></div>
                </div>
                <h3>{t("Pergunta sem resposta")}</h3>
              </article>
              <article className="bc-l-cena bc-l-rev">
                <div className="bc-l-cena-arte bc-l-arte-nota" aria-hidden="true">
                  <div className="bc-l-postit"><span>{t("Ligar pro Pedro amanhã")}</span><i /></div>
                  <small className="bc-l-hora">D+2 · {t("esquecido")}</small>
                </div>
                <h3>{t("Follow-up na memória de alguém")}</h3>
              </article>
              <article className="bc-l-cena bc-l-rev">
                <div className="bc-l-cena-arte bc-l-arte-chips" aria-hidden="true">
                  <div className="bc-l-fone"><i /><b>{t("Oi, tudo bem?")}</b></div>
                  <div className="bc-l-corte"><X size={14} /></div>
                  <div className="bc-l-fone"><i /><b>{t("Mandei o preço")}</b></div>
                  <div className="bc-l-corte"><X size={14} /></div>
                  <div className="bc-l-fone"><i /><b>{t("Fechou?")}</b></div>
                </div>
                <h3>{t("Conversa em pedaços")}</h3>
              </article>
              <article className="bc-l-cena bc-l-rev">
                <div className="bc-l-cena-arte bc-l-arte-planilha" aria-hidden="true">
                  <div className="bc-l-plan"><b>{t("Nome")}</b><b>{t("Etapa")}</b></div>
                  <div className="bc-l-plan"><span>Ana</span><span className="bc-l-duvida">?</span></div>
                  <div className="bc-l-plan"><span>Bruno</span><span className="bc-l-duvida">?</span></div>
                  <div className="bc-l-plan"><span>Carla</span><span className="bc-l-duvida">?</span></div>
                </div>
                <h3>{t("Lead sem etapa")}</h3>
              </article>
            </div>
          </div>
        </section>

        {/* ───────── Editor de fluxos (prancha 07) ───────── */}
        <section className="bc-l-sec" id="fluxos" aria-labelledby="fluxos-titulo">
          <div className="bc-l-wrap">
            <p className="bc-l-eyebrow bc-l-rev">{t("Fluxos")}</p>
            <h2 id="fluxos-titulo" className="bc-l-rev">
              {t("Desenhe o follow-up com setas. Ele para sozinho quando o cliente responde.")}
            </h2>

            <div className="bc-l-editor bc-l-neon bc-l-rev" aria-hidden="true">
              <div className="bc-l-ed-topo">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/brand/batchat-simbolo.svg" alt="" width={34} height={24} />
                <span className="bc-l-ed-nome">
                  <b>{t("Follow-up do guia")}</b>
                  <small>{t("Rascunho salvo agora")}</small>
                </span>
                <span className="bc-l-ed-acoes">
                  <i className="bc-l-ed-btn">···</i>
                  <i className="bc-l-ed-btn">▷ {t("Testar")}</i>
                  <i className="bc-l-ed-btn bc-l-ed-btn--main">{t("Publicar")}</i>
                </span>
              </div>

              <div className="bc-l-ed-corpo">
                <aside className="bc-l-ed-paleta">
                  <div className="bc-l-ed-busca">⌕ {t("Buscar nó")}</div>
                  <small className="bc-l-rotulo">{t("Começar")}</small>
                  <div className="bc-l-ed-it bc-l-ed-it--on"><Lightning size={18} /><span><b>{t("Gatilho")}</b><em>{t("Quando começa")}</em></span></div>
                  <small className="bc-l-rotulo">{t("Passos")}</small>
                  <div className="bc-l-ed-it"><ChatCircle size={18} /><span><b>{t("Mensagem")}</b><em>{t("Envia texto ou mídia")}</em></span></div>
                  <div className="bc-l-ed-it"><Clock size={18} /><span><b>{t("Espera")}</b><em>{t("Minutos a dias")}</em></span></div>
                  <div className="bc-l-ed-it"><TreeStructure size={18} /><span><b>{t("Condição")}</b><em>{t("Se… então…")}</em></span></div>
                  <small className="bc-l-rotulo">{t("Ações")}</small>
                  <div className="bc-l-ed-it"><Sparkle size={18} /><span><b>{t("Etiqueta")}</b><em>{t("Marca o contato")}</em></span></div>
                  <div className="bc-l-ed-it"><Check size={18} /><span><b>{t("Fim")}</b><em>{t("Encerra o fluxo")}</em></span></div>
                </aside>

                <div className="bc-l-ed-tela">
                  <div className="bc-l-ed-pan">
                    <div className="bc-l-ed-quadro">
                      <svg viewBox="0 0 520 470" width="520" height="470" role="presentation">
                        <defs>
                          <marker id="bc-seta" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                            <path d="M0 1 L9 5 L0 9 z" fill="#ffb52c" />
                          </marker>
                        </defs>
                        <path className="bc-l-fio" d="M260 62 V100" markerEnd="url(#bc-seta)" />
                        <path className="bc-l-fio" d="M260 152 V190" markerEnd="url(#bc-seta)" />
                        <path className="bc-l-fio" d="M260 242 V280" markerEnd="url(#bc-seta)" />
                        <path className="bc-l-fio" d="M260 336 C 260 366 110 352 110 400" markerEnd="url(#bc-seta)" />
                        <path className="bc-l-fio" d="M260 336 C 260 366 410 352 410 400" markerEnd="url(#bc-seta)" />
                      </svg>
                      <div className="bc-l-edno bc-l-edno--gatilho" style={{ left: 120, top: 10, width: 280, height: 52 }}>
                        <Lightning size={22} /><span><b>{t("Comentou GUIA")}</b><em>{t("Gatilho · Instagram")}</em></span>
                      </div>
                      <div className="bc-l-edno" style={{ left: 130, top: 100, width: 260, height: 52 }}>
                        <ChatCircle size={22} /><span><b>{t("Aqui está o guia!")}</b><em>{t("Mensagem")}</em></span>
                      </div>
                      <div className="bc-l-edno" style={{ left: 134, top: 190, width: 252, height: 52 }}>
                        <Clock size={22} /><span><b>{t("Esperar 5 horas")}</b><em>{t("Espera")}</em></span>
                      </div>
                      <div className="bc-l-edno bc-l-edno--cond" style={{ left: 120, top: 280, width: 280, height: 56 }}>
                        <TreeStructure size={22} /><span><b>{t("Cliente respondeu?")}</b><em>{t("Condição")}</em></span>
                      </div>
                      <span className="bc-l-edpil bc-l-edpil--sim" style={{ left: 62, top: 358 }}><Check size={12} /> {t("Sim")}</span>
                      <span className="bc-l-edpil bc-l-edpil--nao" style={{ left: 366, top: 358 }}><X size={12} /> {t("Não")}</span>
                      <div className="bc-l-edno bc-l-edno--folha" style={{ left: 20, top: 408, width: 180, height: 48 }}>
                        <Check size={20} /><span><b>{t("Parar o fluxo")}</b><em>{t("Fim")}</em></span>
                      </div>
                      <div className="bc-l-edno bc-l-edno--folha" style={{ left: 320, top: 408, width: 180, height: 48 }}>
                        <ChatCircle size={20} /><span><b>{t("Lembrete do guia")}</b><em>{t("Mensagem")}</em></span>
                      </div>
                    </div>
                  </div>
                  <div className="bc-l-ed-zoom"><i>◎</i><i>−</i><b /><i>+</i><i>⤢</i></div>
                  <div className="bc-l-ed-mapa"><i /><i /><i /><i className="on" /><i /></div>
                </div>

                <aside className="bc-l-ed-painel">
                  <div className="bc-l-ed-painel-topo">
                    <TreeStructure size={24} />
                    <span><b>{t("Cliente respondeu?")}</b><em>{t("Condição")}</em></span>
                  </div>
                  <div className="bc-l-ed-abas"><b className="on">{t("Regra")}</b><b>{t("Saídas")}</b><b>{t("Avançado")}</b></div>
                  <small className="bc-l-rotulo">{t("Quando")}</small>
                  <div className="bc-l-ed-regra"><i>{t("Cliente")}</i><i>{t("respondeu")}</i><i>{t("em 5 h")}</i></div>
                  <small className="bc-l-rotulo">{t("Saídas")}</small>
                  <div className="bc-l-ed-saida"><Check size={16} /><span><b>{t("Sim")}</b><em>{t("Parar o fluxo")}</em></span>›</div>
                  <div className="bc-l-ed-saida"><X size={16} /><span><b>{t("Não")}</b><em>{t("Lembrete do guia")}</em></span>›</div>
                  <div className="bc-l-ed-troca"><span>{t("Parar se o cliente responder")}</span><i className="on" /></div>
                  <div className="bc-l-ed-troca"><span>{t("Só em horário comercial")}</span><i /></div>
                </aside>
              </div>
              <i className="bc-l-varre" />
            </div>
          </div>
        </section>

        {/* ───────── Recursos (formatos diferentes) ───────── */}
        <section className="bc-l-sec" id="recursos" aria-labelledby="recursos-titulo">
          <div className="bc-l-wrap">
            <p className="bc-l-eyebrow bc-l-rev">{t("O resto da operação")}</p>
            <h2 id="recursos-titulo" className="bc-l-rev">{t("Tudo no mesmo lugar.")}</h2>

            {/* IA: texto de um lado, conversa do outro, sem cartão */}
            <div className="bc-l-ia bc-l-rev">
              <div className="bc-l-ia-txt">
                <span className="bc-l-ico"><Robot size={20} aria-hidden /></span>
                <h3>{t("Agente de IA que sabe a hora de parar")}</h3>
                <p>{t("Responde e qualifica. Pediu preço? Passa para uma pessoa.")}</p>
              </div>
              <div className="bc-l-ia-chat" aria-hidden="true">
                <div className="bc-l-bol bc-l-bol--in">{t("Qual o valor?")}</div>
                <div className="bc-l-bol bc-l-bol--bot">{t("Posso te explicar os planos?")}</div>
                <div className="bc-l-bol bc-l-bol--in">{t("Quero falar com alguém")}</div>
                <div className="bc-l-passou"><UsersThree size={12} aria-hidden /> {t("Equipe assumiu")}</div>
              </div>
            </div>

            {/* Funil 3D: onde cada lead está e por onde passa */}
            <div className="bc-l-funil3d bc-l-neon bc-l-rev" aria-hidden="true">
              <div className="bc-l-funil3d-arte">
                <svg viewBox="0 0 420 460" role="presentation">
                  <defs>
                    <linearGradient id="bc-fg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor="#ffd071" stopOpacity=".26" />
                      <stop offset="1" stopColor="#ff7a2e" stopOpacity=".05" />
                    </linearGradient>
                    <clipPath id="bc-fclip"><path d="M20 70 A190 34 0 0 1 400 70 L244 330 L238 420 L182 420 L176 330 Z" /></clipPath>
                  </defs>
                  <g className="bc-l-f-brilho">
                    <path d="M20 70 L176 330 L182 420 L238 420 L244 330 L400 70 Z" fill="url(#bc-fg)" />
                    {malha.filter((m) => !m.frente).map((m, i) => (<path key={`t${i}`} d={m.d} className="bc-l-f-fio bc-l-f-fio--tras" />))}
                    {malha.filter((m) => m.frente).map((m, i) => (<path key={`f${i}`} d={m.d} className="bc-l-f-fio" />))}
                    {aneis.map((r) => (<ellipse key={r.y} cx="210" cy={r.y} rx={r.rx} ry={r.ry} className="bc-l-f-anel" />))}
                    <path d="M20 70 L176 330 L182 420 M400 70 L244 330 L238 420" className="bc-l-f-borda" />
                    <ellipse cx="210" cy="420" rx="28" ry="5" className="bc-l-f-anel" />
                  </g>
                  <g clipPath="url(#bc-fclip)">
                    {particulas.map((p, i) => (
                      <circle key={i} cx={p.x} cy={p.y} r={p.r} className="bc-l-f-part" style={{ ["--dx" as string]: `${p.dx}px`, animationDelay: `${p.atraso}s` }} />
                    ))}
                  </g>
                </svg>
                {clientesFunil.map((c, i) => (
                  <span key={c.nome} className="bc-l-f-lead" style={{ top: `${c.topo}%`, animationDelay: `${i * -1.3}s` }}><i />{c.nome}</span>
                ))}
              </div>
              <div className="bc-l-funil3d-lista">
                <h3>{t("Funil de vendas")}</h3>
                <ol>
                  {etapas.map((e, i) => (<li key={e} style={{ ["--i" as string]: i }}><i />{e}<em>{clientesFunil[i]?.nome}</em></li>))}
                </ol>
              </div>
            </div>

            {/* Agenda: calendário da semana, bloco novo aparecendo */}
            <div className="bc-l-agenda bc-l-rev">
              <div className="bc-l-agenda-arte bc-l-neon" aria-hidden="true">
                <div className="bc-l-sem">
                  {["seg 11", "ter 12", "qua 13", "qui 14", "sex 15"].map((d, i) => (
                    <div key={d} className={`bc-l-dia${i === 2 ? " bc-l-dia--hoje" : ""}`}><b>{d}</b></div>
                  ))}
                  {eventosAgenda.map((e) => (
                    <span
                      key={`${e.col}-${e.lin}`}
                      className={`bc-l-ev${e.novo ? " bc-l-ev--novo" : ""}${e.tom ? ` bc-l-ev--${e.tom}` : ""}`}
                      style={{ gridColumn: e.col, gridRow: `${e.lin} / span ${e.alt}` }}
                    >
                      {e.novo ? <Clock size={12} /> : null} {horaDe(e.lin)} · {e.nome}
                    </span>
                  ))}
                </div>
                <ul className="bc-l-dia-lista">
                  <li className="bc-l-dia-lista-cab">{t("Quarta, 13")}</li>
                  {diaLista.map((e, i) => (
                    <li key={e.nome} className={e.novo ? "bc-l-dl--novo" : ""}>
                      <time>{horaDe(e.lin)}</time>
                      <b>{e.nome}</b>
                      <em>{tiposDoDia[i % tiposDoDia.length]}</em>
                    </li>
                  ))}
                </ul>
                <div className="bc-l-toast"><Checks size={14} /> Larissa · {t("confirmou no WhatsApp")}</div>
                <div className="bc-l-google-sel"><CalendarBlank size={13} /> Google Agenda</div>
              </div>
              <div className="bc-l-agenda-txt">
                <span className="bc-l-ico"><CalendarBlank size={20} aria-hidden /></span>
                <h3>{t("Agenda dentro da conversa")}</h3>
                <p>{t("Marque, remarque e confirme sem sair do atendimento.")}</p>
              </div>
            </div>
          </div>
        </section>

        {/* ───────── Passos: uma linha só ───────── */}
        <section className="bc-l-sec bc-l-sec--compacta" aria-labelledby="como">
          <div className="bc-l-wrap">
            <h2 id="como" className="bc-l-rev">{t("Em quatro passos.")}</h2>
            <ol className="bc-l-cadeia bc-l-rev">
              {passos.map((p, i) => {
                const Icone = [WhatsappLogo, Robot, Lightning, UsersThree][i] ?? Lightning;
                return (
                  <Fragment key={p}>
                    <li className={`bc-l-pno bc-l-pno--${i}`}>
                      <span className="bc-l-pno-ico"><Icone size={22} aria-hidden /></span>
                      <span className="bc-l-pno-txt"><em>{t("Passo")} {i + 1}</em><b>{p}</b></span>
                      <i className="bc-l-pno-luz" aria-hidden="true" />
                    </li>
                    {i < passos.length - 1 ? <li className={`bc-l-lig bc-l-lig--${i}`} aria-hidden="true"><i /></li> : null}
                  </Fragment>
                );
              })}
            </ol>
          </div>
        </section>

        {/* ───────── Planos ───────── */}
        <section className="bc-l-sec" id="planos" aria-labelledby="planos-titulo">
          <div className="bc-l-wrap">
            <h2 id="planos-titulo" className="bc-l-rev">{t("Escolha o seu plano.")}</h2>
            <p className="bc-l-planos-sub bc-l-rev">
              {t("Sem fidelidade. Cancele quando quiser, com garantia de 7 dias.")}
            </p>
            <div className="bc-l-planos">
              {planos.map((pl, i) => (
                <article
                  key={pl.id}
                  className={`bc-l-plano bc-l-rev${pl.destaque ? " bc-l-plano--destaque" : ""}`}
                  style={{ "--bc-l-d": `${i * 90}ms` } as CSSProperties}
                  aria-labelledby={`plano-${pl.id}`}
                >
                  <div className="bc-l-plano-topo">
                    <span className="bc-l-plano-icone" aria-hidden="true"><pl.Icone size={22} weight="duotone" /></span>
                    {pl.selo ? <span className="bc-l-plano-selo">{pl.selo}</span> : null}
                  </div>
                  <h3 id={`plano-${pl.id}`}>{pl.nome}</h3>
                  <p className="bc-l-plano-nota">{pl.nota}</p>
                  <p className="bc-l-plano-preco">
                    {pl.de ? (
                      <span className="bc-l-plano-de-linha">
                        <s className="bc-l-plano-de">
                          <span className="bc-l-sr">{t("Preço normal")} </span>R$ {pl.de}
                        </s>
                        <span className="bc-l-plano-economia">{t("economize R$ {n}").replace("{n}", String(pl.de - pl.preco))}</span>
                      </span>
                    ) : null}
                    <span className="bc-l-plano-valor"><small>R$</small>{pl.preco}</span>
                    <span className="bc-l-plano-mes">/{t("mês")}</span>
                  </p>
                  <ul className="bc-l-plano-itens">
                    {pl.herda ? <li className="bc-l-plano-herda"><Sparkle size={16} weight="fill" aria-hidden /><span>{pl.herda}</span></li> : null}
                    {pl.itens.map((it) => (
                      <li key={it}>
                        <Check size={16} weight="bold" aria-hidden />
                        <span>{it}</span>
                      </li>
                    ))}
                  </ul>
                  <Link
                    href={`/signup?plano=${pl.id}`}
                    className={`bc-l-btn bc-l-btn--lg${pl.destaque ? " bc-l-btn--main" : ""}`}
                  >
                    {pl.cta}
                  </Link>
                  {pl.ajuda ? (
                    <p className="bc-l-plano-ajuda">
                      {t("Comprou com outro e-mail ou não conseguiu liberar?")}{" "}
                      <a href={`https://wa.me/${WHATSAPP_DE_SUPORTE}?text=${encodeURIComponent(t("Oi! Sou aluno da Bat Academy e quero liberar o plano Aluno do BatChat."))}`} target="_blank" rel="noopener noreferrer">
                        {t("Fale com a gente no WhatsApp")}
                      </a>
                    </p>
                  ) : null}
                </article>
              ))}
            </div>
            <p className="bc-l-planos-rodape bc-l-rev">
              {t("O uso de IA tem um teto mensal em cada plano. As mensagens do WhatsApp são cobradas pela Meta, direto na sua conta da Meta, fora dos valores acima.")}
            </p>
          </div>
        </section>

        {/* ───────── Perguntas ───────── */}
        <section className="bc-l-sec bc-l-sec--compacta" id="perguntas" aria-labelledby="faq">
          <div className="bc-l-wrap">
            <h2 id="faq" className="bc-l-rev">{t("O que as pessoas perguntam.")}</h2>
            <div className="bc-l-faq">
              {perguntas.map((q) => (
                <details key={q.p} className="bc-l-card bc-l-rev">
                  <summary>{q.p}</summary>
                  <p>{q.r}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ───────── Chamada final ───────── */}
        <section className="bc-l-final">
          <div className="bc-l-final-luz" aria-hidden="true" />
          <div className="bc-l-wrap">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="bc-l-final-logo bc-l-rev" src="/brand/batchat-simbolo.svg" alt="" width={96} height={66} />
            <h2 className="bc-l-rev">{t("Pronto para atender sem se perder?")}</h2>
            <div className="bc-l-cta bc-l-cta--c bc-l-rev">
              <Link href="/signup" className="bc-l-btn bc-l-btn--main bc-l-btn--lg">
                {t("Criar conta")} <ArrowRight size={16} aria-hidden />
              </Link>
              <Link href="/login" className="bc-l-btn bc-l-btn--lg">
                {t("Entrar")}
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="bc-l-foot">
        <div className="bc-l-wrap">
          <p className="bc-l-legal" id="google">
            {t("Quando a empresa conecta o Google Agenda, o")} {marca.nome}{" "}
            {t(
              "mostra a ocupação da agenda e cria, altera e cancela os agendamentos pedidos pela própria pessoa. Quando conecta o Google Ads, devolve ao anúncio as vendas que ele trouxe. O uso dos dados do Google está descrito na",
            )}{" "}
            <Link href="/legal/privacy#dados-do-google">{t("Política de Privacidade")}</Link>.
          </p>
          <div className="bc-l-foot-linha">
            <span>{marca.nome}</span>
            <nav>
              <Link href="/legal/privacy">{t("Política de Privacidade")}</Link>
              <Link href="/legal/terms">{t("Termos de Uso")}</Link>
            </nav>
          </div>
        </div>
      </footer>
    </div>
  );
}
