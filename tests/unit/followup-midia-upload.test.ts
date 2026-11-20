import { describe, expect, it } from "vitest";
import { assinaturaDaMidiaConfere, validarMidiaUpload } from "@/lib/followup/validar-midia-upload";

describe("mídia própria no fluxo", () => {
  it("aceita exatamente 15 MB e recusa um byte a mais, vazio e tipos ativos", () => {
    expect(validarMidiaUpload("audio/mpeg", 15_000_000)).toBeNull();
    expect(validarMidiaUpload("video/mp4", 15_000_001)).toContain("15 MB");
    expect(validarMidiaUpload("image/png", 0)).toBeTruthy();
    expect(validarMidiaUpload("image/svg+xml", 500)).toBeTruthy();
    expect(validarMidiaUpload("text/html", 500)).toBeTruthy();
  });
  it("recusa HTML disfarçado de foto ou áudio e aceita assinaturas conhecidas", () => {
    const html = Buffer.from("<html>hello world</html>");
    for (const ext of ["jpg", "png", "mp3", "mp4", "ogg", "webm"]) {
      expect(assinaturaDaMidiaConfere(html, ext)).toBe(false);
    }
    expect(assinaturaDaMidiaConfere(Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]), "png")).toBe(true);
    expect(assinaturaDaMidiaConfere(Buffer.from("ID3abcdefghijklm"), "mp3")).toBe(true);
  });
});
