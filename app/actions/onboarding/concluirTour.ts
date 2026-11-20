"use server";

/**
 * Server Action: o mini tour pela casca do app terminou (ou foi pulado).
 *
 * Só carimba `onboarding_state.tour`. É o carimbo que o layout de `/app` lê para
 * deixar de mostrar o tour e mandar a pessoa para o setup em `/onboarding`.
 * Idempotente: repetir só regrava a mesma marca.
 */
import { patchOnboardingState, requireOnboardingCtx, OnboardingError } from "./_shared";

export type ConcluirTourResult =
  | { ok: true }
  | { ok: false; error: "auth_required" | "no_active_org" | "forbidden" | "db_error" };

export async function concluirTour(opcoes?: { pulou?: boolean }): Promise<ConcluirTourResult> {
  let ctx;
  try {
    ctx = await requireOnboardingCtx();
  } catch (err) {
    if (err instanceof OnboardingError) return { ok: false, error: err.code as never };
    throw err;
  }
  try {
    await patchOnboardingState(ctx.orgId, {
      tour: { done_at: new Date().toISOString(), ...(opcoes?.pulou ? { skipped: true } : {}) },
    });
  } catch (err) {
    if (err instanceof OnboardingError) return { ok: false, error: "db_error" };
    throw err;
  }
  return { ok: true };
}
