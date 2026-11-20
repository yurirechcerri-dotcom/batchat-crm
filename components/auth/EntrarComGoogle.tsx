"use client";

import { useState } from "react";

import { useT } from "@/hooks/i18n/useT";
import { useIdioma } from "@/lib/i18n/IdiomaProvider";
import { fusoDoNavegador } from "@/lib/tempo/fuso-do-navegador";
import { signInWithGoogle } from "@/app/actions/auth/signInWithGoogle";
import { AvisoSemResposta, useEnvioComTeto } from "@/components/auth/teto-da-espera";

/**
 * O botão "Entrar com Google" — o mesmo no login e no cadastro.
 *
 * O cadastro passa `convite` porque a volta não tem como saber que a pessoa
 * veio de um convite: o Google não devolve nada nosso além do que pusermos na
 * URL de retorno (ver `lib/auth/entrada-com-google.ts`).
 *
 * No sucesso a action devolve a URL do `/authorize` e quem sai para o Google
 * é esta tela, com `window.location.assign` — carga completa. O `redirect()`
 * da action virava navegação interna do Next quando o Supabase responde no
 * mesmo domínio do app, e a tela ficava parada (ver `signInWithGoogle.ts`).
 * O que pode voltar é a recusa, e ela é mostrada aqui mesmo, embaixo do botão,
 * para não perder o que a pessoa já tinha digitado no formulário.
 */
export function EntrarComGoogle({ next, convite, posicao = "fim" }: { next?: string; convite?: string; posicao?: "topo" | "fim" }) {
  const t = useT();
  const idioma = useIdioma();
  const { pendente: isPending, semResposta, enviar } = useEnvioComTeto();
  const [erro, setErro] = useState<string | null>(null);
  // O navegador ainda está trocando de página: o botão não volta a ser clicável.
  const [saindo, setSaindo] = useState(false);

  const onClick = () => {
    setErro(null);
    // O idioma desta tela e o fuso do navegador vão junto: se a volta for um
    // primeiro acesso, a empresa nasce com eles (`lib/auth/perfil-da-empresa-nova.ts`).
    void enviar(() => signInWithGoogle({ next, convite, idioma, fuso: fusoDoNavegador() }), (res) => {
      if (res.ok) {
        setSaindo(true);
        window.location.assign(res.url);
        return;
      }

      setErro(
        res.error === "google_indisponivel"
          ? t(
              "O Google não está habilitado nesta instalação. Entre com e-mail e senha, ou peça a quem administra para habilitá-lo.",
            )
          : t("Não foi possível falar com o Google agora. Tente novamente em instantes."),
      );
    });
  };

  const divisor = (
    <div className="flex items-center gap-3">
      <span className="h-px flex-1 bg-border" />
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{t("ou")}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );

  return (
    <div className="space-y-4">
      {posicao === "fim" && divisor}
      {erro && (
        <div
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {erro}
        </div>
      )}
      {semResposta && <AvisoSemResposta />}
      <button
        type="button"
        data-testid="entrar-com-google"
        disabled={isPending || saindo}
        onClick={onClick}
        className="flex min-h-12 w-full items-center justify-center gap-3 rounded-xl border border-border-strong bg-surface-elevated px-4 text-sm font-semibold text-text shadow-[0_1px_2px_rgb(0_0_0/0.25),0_6px_18px_rgb(0_0_0/0.18)] transition hover:-translate-y-px hover:border-accent hover:shadow-[0_2px_4px_rgb(0_0_0/0.3),0_10px_26px_rgb(0_0_0/0.25)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
      >
        <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
          <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.9 2.4 30.4 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
          <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6z" />
          <path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z" />
          <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.8 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
        </svg>
        <span>{isPending || saindo ? t("Abrindo o Google...") : t("Entrar com Google")}</span>
      </button>
      {posicao === "topo" && divisor}
    </div>
  );
}
