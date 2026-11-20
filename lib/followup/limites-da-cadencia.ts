/** Limites finitos compartilhados pelo editor, publicação e execução.
 * A cadência longa é opt-in na versão publicada; não muda STOP, canal ou pausa.
 */
export function limitesDaCadencia(settings?: { cadencia_estendida?: boolean }) {
  return settings?.cadencia_estendida
    ? { nos: 200, arestas: 400, passos: 120, ticks: 320 }
    : { nos: 60, arestas: 120, passos: 30, ticks: 80 };
}
