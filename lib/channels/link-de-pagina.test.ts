import { describe, expect, it } from "vitest";

import { ehLinkDePaginaSocial } from "./link-de-pagina";

describe("ehLinkDePaginaSocial", () => {
  it("reconhece reel, post e vídeo de rede social", () => {
    expect(ehLinkDePaginaSocial("https://www.instagram.com/reel/C52XZThM-Qp/")).toBe(true);
    expect(ehLinkDePaginaSocial("https://youtu.be/abc")).toBe(true);
    expect(ehLinkDePaginaSocial("https://m.facebook.com/x")).toBe(true);
  });
  it("não confunde arquivo de mídia nem domínio parecido", () => {
    expect(ehLinkDePaginaSocial("https://cdn.exemplo.com/video.mp4")).toBe(false);
    expect(ehLinkDePaginaSocial("https://notinstagram.com/a")).toBe(false);
    expect(ehLinkDePaginaSocial("isto não é url")).toBe(false);
  });
});
