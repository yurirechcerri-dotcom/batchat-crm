import type { SupabaseClient } from "@supabase/supabase-js";

import { resolverEscopoDoHistorico } from "./historico/zernio-escopo";
import { criarLeitorZernio } from "./historico/zernio-leitura";

/**
 * Fotos de perfil dos contatos de uma conexão social (Instagram/Facebook).
 *
 * O provedor devolve `participantPicture` junto de cada conversa. A leitura é só GET, pelo mesmo leitor
 * do histórico (escopo conferido, chave da própria empresa, nada de ID vindo da tela) e para no teto de
 * páginas: a rotina de avatares roda em lote pequeno e não precisa varrer a conta inteira.
 * Devolve `participantId → URL`. A URL do CDN expira; quem chama baixa o arquivo e guarda no bucket.
 */
export async function fotosDeContatosSociais(
  db: SupabaseClient,
  entrada: { organizationId: string; channelSessionId: string; signal?: AbortSignal },
): Promise<Map<string, string>> {
  const escopo = await resolverEscopoDoHistorico(db, entrada.organizationId, entrada.channelSessionId, entrada.signal);
  const leitor = criarLeitorZernio({ ...escopo, ...(entrada.signal ? { signal: entrada.signal } : {}) });
  const fotos = new Map<string, string>();
  let cursor: string | undefined;
  for (let pagina = 0; pagina < 10; pagina++) {
    const resultado = await leitor.conversas(cursor);
    for (const c of resultado.itens) if (c.foto) fotos.set(c.participanteId, c.foto);
    if (!resultado.proximoCursor) break;
    cursor = resultado.proximoCursor;
  }
  return fotos;
}

/** `<plataforma>:<conta>:<participante>` → id do participante, que é o que o provedor usa para achar a conversa. */
export function participanteDaIdentidadeSocial(identidade: string | null): string | null {
  const m = identidade?.match(/^[a-z]+:[^:]+:(.+)$/);
  return m?.[1] ?? null;
}
