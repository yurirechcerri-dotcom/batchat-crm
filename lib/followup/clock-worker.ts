import { randomUUID } from "node:crypto";
import type pg from "pg";
import { audit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Logger } from "@/lib/agent-engine/obs/logger";
import { createSupabaseAdminClient, runFollowupTick } from "./engine";
import { runFollowupClock, type FollowupClockDeps } from "./clock-loop";

/** Apenas agenda a próxima leitura. Autoridade de execução continua sendo
 * fn_claim_due_followup_enrollments, inclusive fairness/lease/org ativa.
 * Releitura no máximo em30s detecta novas inscrições enquanto está ocioso;
 * prazos já conhecidos são esperados em ms, sem cache de "nada vencido".
 */
export const NEXT_FOLLOWUP_DUE_SQL = `
  select extract(epoch from (
    min(greatest(e.next_eval_at, coalesce(e.claimed_until, e.next_eval_at))) - clock_timestamp()
  )) * 1000 as due_ms
  from followup_enrollments e
  where e.status in ('active', 'waiting_reply', 'dormente')
    and e.next_eval_at is not null
    and exists (select 1 from organizations o where o.id = e.organization_id and o.status = 'active')
`;

export function createFollowupClockDeps(pool: Pick<pg.Pool, "query">, wakeQueue: () => void): FollowupClockDeps {
  return {
    async nextDueMs() {
      const { rows } = await pool.query<{ due_ms: string | number | null }>(NEXT_FOLLOWUP_DUE_SQL);
      if (!rows[0]) throw new Error("followup_deadline_missing");
      return rows[0].due_ms === null ? null : Number(rows[0].due_ms);
    },
    async tick() {
      // O adapter completo do cron preserva agenda, retorno humano, renderização,
      // tarefas/funis e CAS. O adapter parcial da ponte de turno não o substitui.
      // Novo por tick: o mapa de revisões pertence somente aos claims da rodada.
      const admin = createAdminClient();
      const summary = await runFollowupTick({
        db: createSupabaseAdminClient(admin),
        clock: () => new Date(),
        async enqueueJob(job) {
          const { error } = await admin.from("job_queue").insert({
            organization_id: job.organization_id,
            contact_id: job.contact_id,
            kind: "followup_turn",
            payload: job.payload,
          });
          if (error) throw new Error("followup_clock_enqueue_failed");
          wakeQueue();
        },
      });
      if (summary.claim_falhou || summary.claimed || summary.advanced || summary.scheduled || summary.failed || summary.dead) {
        void audit({ action: "followup.worker_run", organizationId: null, bypassedRls: true,
          metadata: { ...summary, source: "worker_clock" }, requestId: randomUUID() });
      }
      if (summary.claim_falhou) throw new Error("followup_clock_claim_failed");
      return summary.claimed > 0;
    },
  };
}

export function runFollowupClockWorker(pool: pg.Pool, log: Logger, signal: AbortSignal, wakeQueue: () => void) {
  return runFollowupClock(createFollowupClockDeps(pool, wakeQueue), log, signal);
}
