import type { ConversaHistorico, LeitorHistoricoZernio, MensagemHistorico } from "./zernio-leitura";
import type { PreviaDoHistorico } from "./previa";

export interface ConferenciaHistoricoZernio {
  conversaElegivel(conversa: ConversaHistorico): Promise<boolean>;
  idsExistentes(ids: string[]): Promise<Set<string>>;
}

export interface PreviaZernio extends PreviaDoHistorico {
  semConteudo: number;
  repetidasNoProvedor: number;
  existentesNoCrm: number;
  chamadas: number;
}

/** Contagem somente leitura. Os limites do provedor continuam valendo mesmo sem corte pelo teto. */
export async function calcularPreviaZernio(
  leitor: LeitorHistoricoZernio,
  conferencia: ConferenciaHistoricoZernio,
  opts: { dias: number; agora: number; tetoDeChamadas?: number; prazoMs?: number; relogio?: () => number },
): Promise<PreviaZernio> {
  const teto = opts.tetoDeChamadas ?? 100;
  const prazo = opts.prazoMs ?? 45_000;
  const relogio = opts.relogio ?? Date.now;
  const comecou = relogio();
  if (!Number.isInteger(opts.dias) || opts.dias < 1 || opts.dias > 365 ||
      !Number.isFinite(opts.agora) || !Number.isInteger(teto) || teto < 1 || teto > 100 ||
      !Number.isFinite(prazo) || prazo < 1 || prazo > 45_000) {
    throw new Error("historico_limite_invalido");
  }
  const inicio = opts.agora - opts.dias * 86_400_000;
  const resultado: PreviaZernio = {
    desde: new Date(inicio).toISOString(), conversas: 0, mensagens: 0,
    audios: 0, imagens: 0, parcial: false, semConteudo: 0,
    repetidasNoProvedor: 0, existentesNoCrm: 0, chamadas: 0,
  };
  const cabe = () => {
    if (resultado.chamadas < teto && relogio() - comecou < prazo) return true;
    resultado.parcial = true;
    return false;
  };
  const avancar = (cursor: string | null, vistos: Set<string>): string | undefined => {
    if (cursor === null) return undefined;
    if (!cursor || vistos.has(cursor)) throw new Error("historico_cursor_repetido");
    vistos.add(cursor);
    return cursor;
  };

  const conversas = new Map<string, ConversaHistorico>();
  const cursores = new Set<string>();
  let cursor: string | undefined;
  do {
    if (!cabe()) return resultado;
    resultado.chamadas += 1;
    const pagina = await leitor.conversas(cursor);
    for (const conversa of pagina.itens) {
      const anterior = conversas.get(conversa.id);
      if (anterior && (anterior.participanteId !== conversa.participanteId || anterior.bsuid !== conversa.bsuid)) {
        throw new Error("historico_identidade_em_conflito");
      }
      // Uma página posterior pode marcar conteúdo indisponível: não reutilizar a antiga.
      conversas.set(conversa.id, conversa);
    }
    cursor = avancar(pagina.proximoCursor, cursores);
  } while (cursor !== undefined);

  const mensagensVistas = new Map<string, string>();
  const contarPagina = async (mensagens: MensagemHistorico[], conversaId: string) => {
    const novas: MensagemHistorico[] = [];
    for (const mensagem of mensagens) {
      if (mensagem.conversaId !== conversaId) throw new Error("historico_escopo_divergente");
      const origem = mensagensVistas.get(mensagem.id);
      if (origem !== undefined && origem !== conversaId) throw new Error("historico_identidade_em_conflito");
      if (origem !== undefined) { resultado.repetidasNoProvedor += 1; continue; }
      mensagensVistas.set(mensagem.id, conversaId);
      const enviada = Date.parse(mensagem.enviadaEm);
      if (!Number.isFinite(enviada)) throw new Error("historico_data_invalida");
      if (enviada >= inicio && enviada <= opts.agora) novas.push(mensagem);
    }
    if (!novas.length) return;
    const existentes = await conferencia.idsExistentes(novas.map((m) => m.id));
    for (const mensagem of novas) {
      resultado.mensagens += 1;
      if (existentes.has(mensagem.id)) resultado.existentesNoCrm += 1;
      if (mensagem.apagada || mensagem.conteudoIndisponivel) {
        resultado.semConteudo += 1;
        continue;
      }
      if (mensagem.anexos.some((a) => a.type === "audio")) resultado.audios += 1;
      if (mensagem.anexos.some((a) => a.type === "image")) resultado.imagens += 1;
    }
  };

  for (const conversa of conversas.values()) {
    const ultima = Date.parse(conversa.atualizadaEm);
    if (!Number.isFinite(ultima)) throw new Error("historico_data_invalida");
    if (conversa.grupo || conversa.conteudoIndisponivel || ultima < inicio) continue;
    if (!(await conferencia.conversaElegivel(conversa))) continue;
    resultado.conversas += 1;
    const vistos = new Set<string>();
    cursor = undefined;
    do {
      if (!cabe()) return resultado;
      resultado.chamadas += 1;
      const pagina = await leitor.mensagens(conversa.id, cursor);
      await contarPagina(pagina.itens, conversa.id);
      cursor = avancar(pagina.proximoCursor, vistos);
    } while (cursor !== undefined);
  }
  return resultado;
}
