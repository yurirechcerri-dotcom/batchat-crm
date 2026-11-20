"use client";

import { useTransition } from "react";
import { useT } from "@/hooks/i18n/useT";
import { finishOnboarding } from "@/app/actions/onboarding/finishOnboarding";

/**
 * "Pular configuração" — a saída que todo setup decente oferece. Fecha o
 * onboarding e leva ao inbox; o que faltou continua acessível dentro do app.
 * Antes existia só em desenvolvimento ("Pular tudo (DEV)"): em produção a
 * pessoa era obrigada a percorrer cada tela.
 */
export function PularConfiguracao() {
  const t = useT();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => void finishOnboarding())}
      className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground disabled:opacity-60"
    >
      {pending ? t("Saindo...") : t("Pular configuração")}
    </button>
  );
}
