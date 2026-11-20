/**
 * Link de PÁGINA de rede social não é arquivo de mídia: baixar `instagram.com/reel/…` devolve HTML, que o envio gravava
 * como "vídeo" e a Inbox mostrava como "Mídia indisponível" (achado de 15/11/2026). Esses links devem ir como TEXTO.
 */
const HOSTS_DE_PAGINA = ["instagram.com", "facebook.com", "fb.watch", "youtube.com", "youtu.be", "tiktok.com", "x.com", "twitter.com"];

export function ehLinkDePaginaSocial(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return HOSTS_DE_PAGINA.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}
