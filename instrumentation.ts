import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
    // Textos traduzidos montados no servidor (e-mails, avisos) usam o tradutor leve;
    // o dicionário é registrado aqui uma vez, antes da primeira requisição.
    const { registrarDicionarioNoServidor } = await import("./lib/i18n/tradutor-leve");
    await registrarDicionarioNoServidor();
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
