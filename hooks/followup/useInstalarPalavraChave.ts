"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";
import {
  followupFlowsListQueryKey,
  type FollowupFlowPointerRow,
} from "@/hooks/followup/useFollowupFlows";

/**
 * Instala uma automação por palavra-chave: o fluxo (rascunho) e a regra
 * (pausada). Sem `showApiError`, como `useInstalarModelo`: o erro tem endereço
 * (palavra inválida, nome repetido) e quem chama o mostra ao lado do botão.
 */
export interface InstalacaoDePalavra {
  model_id: string;
  palavras: string;
  mensagem?: string;
  link?: string;
}

export function useInstalarPalavraChave() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ["followup", "flows", "palavra-chave"],
    mutationFn: async (entrada: InstalacaoDePalavra) => {
      const res = await apiClient.post<{ data: { flow: FollowupFlowPointerRow; rule: { id: string } } }>(
        "/api/v1/ai/followup-flows/palavra-chave",
        entrada,
      );
      return res.data;
    },
    onSuccess: ({ flow }) => {
      qc.setQueryData<FollowupFlowPointerRow[]>(followupFlowsListQueryKey, (prev) =>
        prev ? [flow, ...prev] : [flow],
      );
    },
  });
}
