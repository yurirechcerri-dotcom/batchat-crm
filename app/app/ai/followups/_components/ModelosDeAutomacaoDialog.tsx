"use client";

import { useState, type PointerEvent } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useT } from "@/hooks/i18n/useT";
import { useInstalarPalavraChave } from "@/hooks/followup/useInstalarPalavraChave";
import {
  MODELOS_DE_PALAVRA,
  separarPalavras,
  type CanalDePalavra,
  type ModeloDePalavra,
} from "@/lib/followup/modelos/palavra-chave";
import {
  ArrowLeft,
  ArrowRight,
  ChatCircle,
  Check,
  FileText,
  Lightning,
  LinkIcon,
  Plus,
  Question,
} from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

/**
 * A GALERIA DE AUTOMAÇÕES — o "responde com a palavra X" (ManyChat).
 *
 * Quase sem texto, de propósito: cada cartão é um ícone, um título de duas
 * palavras e o fluxo desenhado (palavra → mensagem → fim). Ninguém lê parágrafo
 * dentro de um cartão; o desenho diz o que ele faz. Escolher um cartão abre o
 * formulário mínimo — a palavra, o link e a própria mensagem, editada DENTRO do
 * balão que o cliente vai ver. Nada é enviado: o fluxo nasce rascunho e a regra
 * pausada (ver `lib/followup/modelos/palavra-chave.ts`).
 *
 * O movimento (entrada em cascata, mola no hover, brilho que segue o cursor) é
 * CSS em `app/batchat-design.css` (`data-bc-auto-*`) e some com "reduzir
 * movimento".
 *
 * ⚠️ INSTAGRAM: o canal social só conversa com quem JÁ escreveu — por isso só a
 * palavra por mensagem direta; comentário e story não existem neste canal.
 */
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "Do zero": abre o diálogo de novo fluxo que a tela já tem. */
  aoComecarDoZero: () => void;
}

const ICONE_DO_MODELO: Record<string, typeof FileText> = {
  "palavra-entrega-material": FileText,
  "palavra-enviar-link": LinkIcon,
  "palavra-responder-duvida": Question,
};

/** O brilho do cartão segue o cursor: só escreve duas variáveis CSS. */
function seguirCursor(e: PointerEvent<HTMLElement>) {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
  e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
}

function IconeDoModelo({ id, grande }: { id: string; grande?: boolean }) {
  const Icone = ICONE_DO_MODELO[id] ?? Lightning;
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-xl border border-accent/40 bg-accent/15 text-accent",
        grande ? "h-14 w-14" : "h-11 w-11",
      )}
    >
      <Icone size={grande ? 28 : 22} weight="duotone" aria-hidden />
    </span>
  );
}

/** O fio âmbar que liga um nó ao próximo. */
function Fio() {
  return <span aria-hidden className="ml-4 block h-3 w-px bg-accent/60" />;
}

/** O fluxo em vertical, como a prancha 07: palavra → mensagem → fim, ligados por uma linha âmbar. */
function MiniFluxo({ palavra, indice }: { palavra: string; indice: number }) {
  const t = useT();
  const no = "flex min-w-0 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-medium";
  return (
    <div aria-hidden className="flex flex-col" style={{ ["--i" as string]: indice }}>
      <span data-bc-auto-no="" style={{ ["--j" as string]: 0 }} className={cn(no, "border-accent bg-accent/15 text-accent")}>
        <Lightning size={13} weight="fill" className="shrink-0" />
        <span className="truncate">{palavra}</span>
      </span>
      <Fio />
      <span data-bc-auto-no="" style={{ ["--j" as string]: 1 }} className={cn(no, "bg-surface-elevated text-text")}>
        <ChatCircle size={13} className="shrink-0" />
        <span className="truncate">{t("Mensagem")}</span>
      </span>
      <Fio />
      <span data-bc-auto-no="" style={{ ["--j" as string]: 2 }} className={cn(no, "bg-surface-elevated text-text-muted")}>
        <Check size={13} weight="bold" className="shrink-0" />
        <span className="truncate">{t("Fim")}</span>
      </span>
    </div>
  );
}

const CARTAO =
  "group relative flex h-full w-full min-w-0 flex-col gap-4 rounded-2xl border bg-surface p-4 text-left " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

export function ModelosDeAutomacaoDialog({ open, onOpenChange, aoComecarDoZero }: Props) {
  const t = useT();
  const router = useRouter();
  const instalar = useInstalarPalavraChave();
  const [canal, setCanal] = useState<CanalDePalavra>("whatsapp");
  const [escolhido, setEscolhido] = useState<ModeloDePalavra | null>(null);
  const [palavras, setPalavras] = useState("");
  const [link, setLink] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const escolher = (m: ModeloDePalavra) => {
    setEscolhido(m);
    setPalavras(m.palavraPadrao);
    setLink("");
    setMensagem(m.mensagemPadrao);
    setErro(null);
  };

  const fechar = (aberto: boolean) => {
    if (!aberto) setEscolhido(null);
    onOpenChange(aberto);
  };

  const confirmar = () => {
    if (!escolhido) return;
    setErro(null);
    instalar.mutate(
      { model_id: escolhido.id, palavras, mensagem, ...(link.trim() ? { link: link.trim() } : {}) },
      {
        // Leva ao construtor: ali a pessoa lê o texto e publica. A regra fica
        // pausada até ela ligá-la em Automações.
        onSuccess: ({ flow }) => {
          fechar(false);
          router.push(`/app/ai/followups/${flow.id}`);
        },
        onError: (e: unknown) =>
          setErro(e instanceof Error && e.message ? t(e.message) : t("Não consegui instalar. Tente de novo.")),
      },
    );
  };

  const faltaLink = escolhido?.pedeLink && link.trim() === "";
  const primeiraPalavra = separarPalavras(palavras)[0] ?? "";

  return (
    <Dialog open={open} onOpenChange={fechar}>
      <DialogContent className="max-h-[88dvh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("Automações")}</DialogTitle>
        </DialogHeader>

        {escolhido ? (
          <div data-bc-auto-tela="" key={escolhido.id} className="space-y-5">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => setEscolhido(null)} aria-label={t("Voltar")}>
                <ArrowLeft size={18} aria-hidden />
              </Button>
              <IconeDoModelo id={escolhido.id} />
              <h3 className="min-w-0 truncate text-lg font-semibold">{t(escolhido.titulo)}</h3>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="pc-palavras" className="text-sm font-medium">
                  {t("Palavra")}
                </label>
                <Input id="pc-palavras" value={palavras} onChange={(e) => setPalavras(e.target.value)} maxLength={300} />
              </div>
              {escolhido.pedeLink ? (
                <div className="space-y-1.5">
                  <label htmlFor="pc-link" className="text-sm font-medium">
                    {t("Link")}
                  </label>
                  <Input
                    id="pc-link"
                    inputMode="url"
                    placeholder="https://"
                    value={link}
                    onChange={(e) => setLink(e.target.value)}
                    maxLength={500}
                  />
                </div>
              ) : null}
            </div>

            {/* A prévia É o editor: o balão âmbar é a mensagem, escrita onde o cliente a vai ler. */}
            <div className="space-y-2 rounded-2xl border bg-bg/60 p-4" data-testid="previa-da-conversa">
              <div className="w-fit max-w-[75%] break-words rounded-2xl rounded-bl-md bg-surface-elevated px-3.5 py-2 text-sm">
                {primeiraPalavra}
              </div>
              <div className="ml-auto w-fit max-w-[90%] min-w-[55%] rounded-2xl rounded-br-md bg-accent px-3.5 py-2.5 text-accent-foreground shadow-sm">
                <textarea
                  aria-label={t("Mensagem")}
                  value={mensagem}
                  onChange={(e) => setMensagem(e.target.value)}
                  rows={2}
                  maxLength={3500}
                  className="block w-full resize-none bg-transparent text-sm font-medium outline-none placeholder:text-accent-foreground/60"
                />
                {escolhido.pedeLink ? (
                  <span className="mt-1 block truncate text-sm font-semibold underline underline-offset-2" data-testid="link-da-previa">
                    {link.trim() || "https://…"}
                  </span>
                ) : null}
              </div>
            </div>

            {erro ? (
              <p role="alert" className="text-sm text-destructive">
                {erro}
              </p>
            ) : null}
            <div className="flex justify-end">
              <Button
                size="lg"
                onClick={confirmar}
                disabled={instalar.isPending || palavras.trim() === "" || Boolean(faltaLink)}
              >
                {instalar.isPending ? t("Instalando...") : t("Instalar")}
              </Button>
            </div>
          </div>
        ) : (
          <Tabs value={canal} onValueChange={(v) => setCanal(v as CanalDePalavra)} data-bc-auto-tela="">
            <TabsList>
              <TabsTrigger value="whatsapp" className="data-[state=active]:bg-accent data-[state=active]:text-accent-foreground">
                WhatsApp
              </TabsTrigger>
              <TabsTrigger value="instagram" className="data-[state=active]:bg-accent data-[state=active]:text-accent-foreground">
                Instagram
              </TabsTrigger>
            </TabsList>

            {(["whatsapp", "instagram"] as const).map((c) => {
              const modelos = MODELOS_DE_PALAVRA.filter((m) => m.canais.includes(c));
              return (
                <TabsContent key={c} value={c} className="mt-4">
                  {c === "instagram" ? (
                    <p className="mb-3 text-xs text-muted-foreground">{t("No Instagram: só por mensagem direta.")}</p>
                  ) : null}
                  <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {modelos.map((m, i) => (
                      <li key={m.id} className="min-w-0">
                        <button
                          type="button"
                          data-bc-auto-card=""
                          style={{ ["--i" as string]: i }}
                          onPointerMove={seguirCursor}
                          onClick={() => escolher(m)}
                          className={CARTAO}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <IconeDoModelo id={m.id} grande />
                            <span data-bc-auto-seta="" aria-hidden className="mt-1 text-accent">
                              <ArrowRight size={18} />
                            </span>
                          </div>
                          <span className="text-lg font-semibold leading-tight">{t(m.titulo)}</span>
                          <MiniFluxo palavra={m.palavraPadrao} indice={i} />
                        </button>
                      </li>
                    ))}
                    <li className="min-w-0">
                      <button
                        type="button"
                        data-bc-auto-card=""
                        style={{ ["--i" as string]: modelos.length }}
                        onPointerMove={seguirCursor}
                        onClick={() => {
                          fechar(false);
                          aoComecarDoZero();
                        }}
                        className={cn(CARTAO, "items-start justify-between border-dashed")}
                      >
                        <span className="flex h-14 w-14 items-center justify-center rounded-xl border border-dashed border-accent/50 text-accent">
                          <Plus size={26} aria-hidden />
                        </span>
                        <span className="text-lg font-semibold leading-tight">{t("Do zero")}</span>
                      </button>
                    </li>
                  </ul>
                </TabsContent>
              );
            })}
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
