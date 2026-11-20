import type { SupabaseClient } from "@supabase/supabase-js";
import { socialMessageId } from "../social/catalog";
import { resolverEscopoDoHistorico } from "./zernio-escopo";
import { criarLeitorZernio } from "./zernio-leitura";
import { calcularPreviaZernio } from "./zernio-previa";

function lotesDeIds(ids: string[]): string[][] {
  const lotes: string[][] = [];
  let lote: string[] = [];
  // URLSearchParams codifica pontuação que encodeURIComponent deixa literal.
  // Cotar e escapar todos os IDs é um teto conservador para o filtro PostgREST.
  const tamanho = (valores: string[]) => new URLSearchParams({
    external_id: `in.(${valores.map((id) => `"${id.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`).join(",")})`,
  }).toString().length;
  for (const id of ids) {
    if (tamanho([id]) > 4_800) throw new Error("historico_identidade_longa");
    if (lote.length === 25 || tamanho([...lote, id]) > 5_000) {
      lotes.push(lote); lote = [];
    }
    lote.push(id);
  }
  if (lote.length) lotes.push(lote);
  return lotes;
}

/** Inventário agregado do que o canal oferece. Não cria importação, contatos ou mensagens. */
export async function consultarHistoricoDisponivel(
  db: SupabaseClient,
  entrada: { organizationId: string; channelSessionId: string; dias: number; agora?: number; signal?: AbortSignal },
) {
  const prazo = new AbortController();
  const timer = setTimeout(() => prazo.abort(new Error("historico_prazo_esgotado")), 60_000);
  const signal = entrada.signal ? AbortSignal.any([entrada.signal, prazo.signal]) : prazo.signal;
  let interromper: () => void = () => {};
  const cancelamento = new Promise<never>((_resolve, reject) => {
    interromper = () => reject(signal.reason ?? new Error("historico_cancelado"));
    if (signal.aborted) interromper();
    else signal.addEventListener("abort", interromper, { once: true });
  });
  try {
    return await Promise.race([consultar(db, { ...entrada, signal }), cancelamento]);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", interromper);
  }
}

async function consultar(
  db: SupabaseClient,
  entrada: { organizationId: string; channelSessionId: string; dias: number; agora?: number; signal: AbortSignal },
) {
  const { organizationId, channelSessionId } = entrada;
  entrada.signal.throwIfAborted();
  const escopo = await resolverEscopoDoHistorico(db, organizationId, channelSessionId, entrada.signal);
  entrada.signal.throwIfAborted();
  return calcularPreviaZernio(criarLeitorZernio({ ...escopo, signal: entrada.signal }), {
    // Isto conta o disponível no provedor; elegibilidade para importar exige
    // a conferência LGPD/identidade da rodada, que não é acionada nesta consulta.
    conversaElegivel: async () => true,
    async idsExistentes(ids) {
      // O leitor conserva o ID da plataforma. O inbox social acrescenta a conta
      // ao gravar: comparar o ID cru perderia duplicatas ou confundiria canais.
      const idsDoProvedor = new Map(ids.map((id) => [
        escopo.plataforma === "whatsapp" ? id : socialMessageId(escopo.contaId, id), id,
      ]));
      const encontrados = new Set<string>();
      for (const lote of lotesDeIds([...idsDoProvedor.keys()])) {
        entrada.signal.throwIfAborted();
        const { data, error } = await db.from("messages")
          .select("external_id, channel_session_id")
          .eq("organization_id", organizationId).in("external_id", lote).abortSignal(entrada.signal);
        entrada.signal.throwIfAborted();
        if (error) throw new Error("historico_conferencia_indisponivel");
        for (const linha of data ?? []) {
          // O índice é org + external_id. Outro canal com o mesmo id é conflito,
          // não uma duplicata que se pode pular silenciosamente ao importar.
          if (linha.channel_session_id !== channelSessionId) throw new Error("historico_identidade_em_conflito");
          const idOriginal = idsDoProvedor.get(linha.external_id);
          if (idOriginal !== undefined) encontrados.add(idOriginal);
        }
      }
      return encontrados;
    },
  }, { dias: entrada.dias, agora: entrada.agora ?? Date.now(), tetoDeChamadas: 20, prazoMs: 45_000 });
}
