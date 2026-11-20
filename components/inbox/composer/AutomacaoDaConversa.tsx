"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FlowArrow } from "@/lib/ui/icons";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FollowupDoContato } from "@/components/inbox/FollowupDoContato";
import { useT } from "@/hooks/i18n/useT";

interface Props {
  contactId: string;
  contactName?: string | null;
  conversationId: string;
  organizationId: string;
  somenteLeitura: boolean;
  podeParar: boolean;
  bloqueado: boolean;
}

/** Abrir consulta o estado; somente os botões do painel alteram a execução. */
export function AutomacaoDaConversa(props: Props) {
  const scope = `${props.organizationId}:${props.contactId}:${props.conversationId}`;
  return <PainelDeAutomacao key={scope} {...props} />;
}

function PainelDeAutomacao(props: Props) {
  const t = useT();
  const [aberto, setAberto] = useState(false);
  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="size-11 shrink-0"
                aria-label={t("Automação")}>
                <FlowArrow size={20} weight="regular" aria-hidden />
              </Button>
            </DialogTrigger>
          </TooltipTrigger>
          <TooltipContent>{t("Automação")}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <DialogContent className="max-h-[92dvh] w-[calc(100%_-_2rem)] max-w-3xl overflow-y-auto rounded-2xl shadow-2xl">
        <DialogHeader>
          <DialogTitle>{t("Automação desta conversa")}</DialogTitle>
          <DialogDescription>
            {t("Pause ou retome o fluxo atual. Para trocar de fluxo, pare o atual e escolha outro.")}
          </DialogDescription>
        </DialogHeader>
        {aberto && <FollowupDoContato {...props} modo="automacao" />}
        <p className="text-xs text-muted-foreground">
          {t("Retomar conserva o ponto salvo e as regras de envio. Não libera o agente de IA nem remove bloqueios do contato.")}
        </p>
        <Button variant="outline" asChild>
          <Link href="/app/ai/followups">{t("Abrir biblioteca de fluxos")}</Link>
        </Button>
      </DialogContent>
    </Dialog>
  );
}
