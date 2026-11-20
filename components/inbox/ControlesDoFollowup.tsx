"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { useIntervirNoFollowup } from "@/hooks/followup/useFollowupEnrollment";
import { useT } from "@/hooks/i18n/useT";

interface Props {
  enrollmentId: string;
  status: string;
  podeEscrever: boolean;
  bloqueado: boolean;
  ocupado: boolean;
  aoAlterar: () => void;
  retomadaExplicita?: boolean;
}

/** A mesma pausa do dossiê, ao alcance de quem está atendendo na Inbox. */
export function ControlesDoFollowup({
  enrollmentId, status, podeEscrever, bloqueado, ocupado, aoAlterar, retomadaExplicita = false,
}: Props) {
  const t = useT();
  const intervir = useIntervirNoFollowup();
  const acao = status === "paused_manual" ? "resume"
    : status === "active" || status === "waiting_reply" ? "pause" : null;

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {podeEscrever && !bloqueado && acao && (
        <Button
          variant="outline"
          size="sm"
          className="min-h-11 lg:min-h-0"
          disabled={ocupado || intervir.isPending}
          data-testid={`followup-${acao}`}
          onClick={() => intervir.mutate(
            { id: enrollmentId, acao },
            { onSuccess: aoAlterar },
          )}
        >
          {acao === "pause" ? t("Pausar") : retomadaExplicita ? t("Retomar de onde parou") : t("Retomar")}
        </Button>
      )}
      <Button variant="outline" size="sm" className="min-h-11 lg:min-h-0" asChild>
        <Link href={`/app/ai/followups/enrollments/${enrollmentId}`}>
          {t("Ver detalhes")}
        </Link>
      </Button>
    </div>
  );
}
