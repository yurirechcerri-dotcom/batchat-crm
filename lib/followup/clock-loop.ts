import { setTimeout as sleep } from "node:timers/promises";
import type { Logger } from "@/lib/agent-engine/obs/logger";

const IDLE_MS = 30_000;
const PROGRESS_MS = 250;
const STALE_MS = 90_000;
type Status = { started: boolean; lastCompletedAt: number | null; lastStartedAt: number | null; failed: boolean };
const status: Status = { started: false, lastCompletedAt: null, lastStartedAt: null, failed: false };

export function followupClockHealth(now = Date.now()) {
  const last = status.lastCompletedAt ?? status.lastStartedAt;
  return {
    ...status,
    stalled: status.started && (status.failed || last === null || now - last > STALE_MS),
  };
}

export type FollowupClockDeps = {
  /** Prazo pelo relógio do BANCO; null = nenhuma inscrição elegível. Não faz claim. */
  nextDueMs: () => Promise<number | null>;
  /** Usa o claim/executor nativo, nunca executa uma linha só porque a consulta a viu. */
  tick: () => Promise<boolean | void>;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  now?: () => number;
};

/** Um tick por vez. A fila continua sendo durável no banco; nada é mantido
 * em um timer por contato. Reiniciar só exige reler vencidos/leases existentes.
 * O cron de minuto permanece recuperação para instalações sem este worker.
 */
export async function runFollowupClock(deps: FollowupClockDeps, log: Logger, signal: AbortSignal): Promise<void> {
  const now = deps.now ?? Date.now;
  const wait = deps.sleep ?? ((ms, abort) => sleep(ms, undefined, { signal: abort }));
  status.started = true;
  status.lastStartedAt = now();
  status.lastCompletedAt = null;
  status.failed = false;
  while (!signal.aborted) {
    let delay = IDLE_MS;
    try {
      const due = await deps.nextDueMs();
      if (signal.aborted) break;
      if (due !== null && !Number.isFinite(due)) throw new Error("invalid_followup_deadline");
      if (due !== null && due <= 0) {
        const progressed = await deps.tick();
        delay = progressed === false ? IDLE_MS : PROGRESS_MS;
      } else if (due !== null) {
        delay = Math.min(IDLE_MS, Math.max(1, Math.ceil(due)));
      }
      status.lastCompletedAt = now();
      status.failed = false;
    } catch {
      // Sem conteúdo/SQL/segredo no log; a falha degrada saúde e recua, não gira.
      status.failed = true;
      log.error("followup clock: rodada falhou; nova tentativa em 30s");
    }
    if (signal.aborted) break;
    try { await wait(delay, signal); }
    catch (error) { if (!signal.aborted) throw error; }
  }
}
