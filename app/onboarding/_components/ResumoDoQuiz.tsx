"use client";

import { useT } from "@/hooks/i18n/useT";
import type { Quiz } from "@/lib/schemas/onboarding";

const CANAL: Record<Quiz["canais"][number], string> = { whatsapp: "WhatsApp", instagram: "Instagram" };
const OBJETIVO: Record<Quiz["objetivo"], string> = {
  palavra_chave: "Responder palavra-chave",
  atendimento_ia: "Atender e vender com IA",
  recuperar: "Recuperar quem sumiu",
};
const EQUIPE: Record<Quiz["equipe"], string> = { sozinho: "Só eu", equipe: "Eu e minha equipe" };

/**
 * "Resultado do quiz" na lateral: devolve à pessoa o que ela respondeu, para o
 * setup parecer feito sob medida. Sem quiz (passo ainda não feito), não mostra
 * nada — nunca inventa resposta.
 */
export function ResumoDoQuiz({ quiz }: { quiz: Quiz | undefined }) {
  const t = useT();
  if (!quiz) return null;
  const linhas: [string, string][] = [
    [t("Canais"), quiz.canais.map((c) => CANAL[c]).join(", ")],
    [t("Primeiro objetivo"), t(OBJETIVO[quiz.objetivo])],
    [t("Atendimento"), t(EQUIPE[quiz.equipe])],
  ];
  return (
    <section aria-label={t("Resultado do quiz")}>
      <h2 className="text-sm font-semibold">
        {t("Resultado do")} <span className="text-primary">{t("quiz")}</span>
      </h2>
      <dl className="mt-3 space-y-2 text-xs">
        {linhas.map(([rotulo, valor]) => (
          <div key={rotulo}>
            <dt className="text-muted-foreground">{rotulo}</dt>
            <dd className="font-medium text-primary">{valor}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
