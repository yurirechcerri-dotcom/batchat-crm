"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { useT } from "@/hooks/i18n/useT";

import { acceptWelcome } from "@/app/actions/onboarding/acceptWelcome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FUSO_PADRAO, FUSOS_DO_ONBOARDING } from "@/lib/tempo/fusos";
import { fusoDoNavegador } from "@/lib/tempo/fuso-do-navegador";
import { Check } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";
import type { Quiz } from "@/lib/schemas/onboarding";

type Canal = Quiz["canais"][number];
type Objetivo = Quiz["objetivo"];
type Equipe = Quiz["equipe"];

const CANAIS: { valor: Canal; rotulo: string }[] = [
  { valor: "whatsapp", rotulo: "WhatsApp" },
  { valor: "instagram", rotulo: "Instagram" },
];

const OBJETIVOS: { valor: Objetivo; rotulo: string; apoio: string }[] = [
  {
    valor: "palavra_chave",
    rotulo: "Responder uma palavra-chave",
    apoio: "Ex.: a pessoa manda AGENTES e recebe seu material.",
  },
  { valor: "atendimento_ia", rotulo: "Atender e vender com IA", apoio: "A IA responde por você." },
  { valor: "recuperar", rotulo: "Recuperar quem sumiu", apoio: "Follow-up para quem parou de responder." },
];

const EQUIPES: { valor: Equipe; rotulo: string }[] = [
  { valor: "sozinho", rotulo: "Só eu" },
  { valor: "equipe", rotulo: "Eu e minha equipe" },
];

/**
 * O primeiro passo do setup: um quiz de CLIQUES. Nada de texto obrigatório —
 * quem chega aqui acabou de criar a conta e não quer escrever; as respostas só
 * personalizam o que vem depois (lateral e passos).
 */
export function WelcomeForm({ defaultOrgName, orgId }: { defaultOrgName: string; orgId: string }) {
  const t = useT();
  const [canais, setCanais] = useState<Canal[]>([]);
  const [objetivo, setObjetivo] = useState<Objetivo | null>(null);
  const [equipe, setEquipe] = useState<Equipe | null>(null);
  const [nome, setNome] = useState(defaultOrgName);
  const [timezone, setTimezone] = useState(FUSO_PADRAO);
  const [aceito, setAceito] = useState(false);
  const [pending, startTransition] = useTransition();

  // O fuso vem do navegador (se for um oferecido) e segue como campo escondido:
  // não é pergunta para quem acabou de criar a conta. Num efeito, e não no
  // estado inicial, porque o servidor não sabe o fuso — a hidratação divergiria.
  useEffect(() => {
    const doNavegador = fusoDoNavegador();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (doNavegador && FUSOS_DO_ONBOARDING.some((f) => f.id === doNavegador)) setTimezone(doNavegador);
  }, []);

  const alternarCanal = (c: Canal) =>
    setCanais((atual) => (atual.includes(c) ? atual.filter((x) => x !== c) : [...atual, c]));

  const completo = canais.length > 0 && objetivo !== null && equipe !== null && aceito;

  return (
    <form
      className="space-y-8"
      action={(formData) => {
        if (!completo) return;
        startTransition(async () => {
          const res = await acceptWelcome(formData);
          if (res && !res.ok) {
            toast.error(
              res.error === "organization_changed"
                ? t("A empresa ativa mudou. Recarregue a página antes de continuar.")
                : `Falha: ${res.error}`,
            );
          }
        });
      }}
    >
      <Pergunta titulo={t("Onde seus clientes falam com você?")} apoio={t("Pode marcar os dois.")}>
        {CANAIS.map((c) => (
          <Opcao
            key={c.valor}
            marcado={canais.includes(c.valor)}
            onClick={() => alternarCanal(c.valor)}
            tipo="checkbox"
          >
            {c.rotulo}
          </Opcao>
        ))}
      </Pergunta>

      <Pergunta titulo={t("O que você quer automatizar primeiro?")}>
        {OBJETIVOS.map((o) => (
          <Opcao
            key={o.valor}
            marcado={objetivo === o.valor}
            onClick={() => setObjetivo(o.valor)}
            tipo="radio"
            apoio={t(o.apoio)}
          >
            {t(o.rotulo)}
          </Opcao>
        ))}
      </Pergunta>

      <Pergunta titulo={t("Quem atende?")}>
        {EQUIPES.map((e) => (
          <Opcao key={e.valor} marcado={equipe === e.valor} onClick={() => setEquipe(e.valor)} tipo="radio">
            {t(e.rotulo)}
          </Opcao>
        ))}
      </Pergunta>

      {/* O que sobe ao servidor: respostas do quiz, fuso e a org desta aba. */}
      {canais.map((c) => (
        <input key={c} type="hidden" name="canais" value={c} />
      ))}
      {objetivo ? <input type="hidden" name="objetivo" value={objetivo} /> : null}
      {equipe ? <input type="hidden" name="equipe" value={equipe} /> : null}
      <input type="hidden" name="timezone" value={timezone} />
      {/* A org para a qual ESTA aba foi aberta (ver `acceptWelcome`). */}
      <input type="hidden" name="organization_id" value={orgId} />

      <div className="space-y-2">
        <label htmlFor="display_name" className="text-sm font-medium">
          {t("Nome do negócio")} <span className="font-normal text-muted-foreground">({t("opcional")})</span>
        </label>
        <Input
          id="display_name"
          name="display_name"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          maxLength={120}
          placeholder={t("Você muda depois em Configurações")}
        />
      </div>

      <label className="flex items-start gap-2 text-sm text-muted-foreground">
        <input
          type="checkbox"
          checked={aceito}
          onChange={(e) => setAceito(e.target.checked)}
          className="mt-1"
        />
        <span>
          {t("Li e aceito os")}{" "}
          <a className="underline" href="/legal/terms" target="_blank" rel="noreferrer">
            {t("Termos de Uso")}
          </a>{" "}
          {t("e a")}{" "}
          <a className="underline" href="/legal/privacy" target="_blank" rel="noreferrer">
            {t("Política de Privacidade")}
          </a>
          .
        </span>
      </label>

      <div className="flex sm:justify-end">
        <Button type="submit" size="lg" disabled={pending || !completo} className="w-full sm:w-auto">
          {pending ? t("Salvando...") : t("Continuar")}
        </Button>
      </div>
    </form>
  );
}

function Pergunta({
  titulo,
  apoio,
  children,
}: {
  titulo: string;
  apoio?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-base font-semibold tracking-tight">{titulo}</legend>
      {apoio ? <p className="-mt-1 text-sm text-muted-foreground">{apoio}</p> : null}
      <div className="grid gap-2 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

function Opcao({
  marcado,
  onClick,
  tipo,
  apoio,
  children,
}: {
  marcado: boolean;
  onClick: () => void;
  tipo: "radio" | "checkbox";
  apoio?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role={tipo}
      aria-checked={marcado}
      onClick={onClick}
      className={cn(
        "rounded-lg border p-4 text-left transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        marcado ? "border-primary bg-primary/15 ring-1 ring-primary" : "bg-card hover:bg-muted",
      )}
    >
      <span className="flex items-center justify-between gap-2 text-sm font-medium">
        {children}
        {marcado ? <Check weight="bold" className="h-4 w-4 shrink-0 text-primary" aria-hidden /> : null}
      </span>
      {apoio ? <span className="mt-1 block text-xs text-muted-foreground">{apoio}</span> : null}
    </button>
  );
}
