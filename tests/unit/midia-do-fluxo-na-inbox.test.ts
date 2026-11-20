import { describe, expect, it } from "vitest";

import { caminhoDaMidiaDoFluxo } from "@/lib/followup/midia-privada";

const ORG = "a234cf04-4c0b-49d2-ba1c-409d36cb27a4";
const HASH = "f447b17e626139aa088b94e668003e1d6fbc1019a848628264f0bdb3f3e88c44";
const assinada = (path: string, bucket = "followup-media") =>
  `https://deskcommcrm.batchat.com.br/storage/v1/object/sign/${bucket}/${path}?token=abc.def.ghi`;

describe("mídia enviada por fluxo continua abrindo na Inbox depois de a URL assinada vencer", () => {
  it("extrai o caminho durável de uma URL assinada do bucket do fluxo", () => {
    expect(caminhoDaMidiaDoFluxo(assinada(`${ORG}/${HASH}.jpg`), ORG)).toBe(`${ORG}/${HASH}.jpg`);
    expect(caminhoDaMidiaDoFluxo(assinada(`${ORG}/${HASH}.mp3`), ORG)).toBe(`${ORG}/${HASH}.mp3`);
  });
  it("recusa outra organização, outro bucket e caminho fora do padrão", () => {
    const outra = "b234cf04-4c0b-49d2-ba1c-409d36cb27a4";
    expect(caminhoDaMidiaDoFluxo(assinada(`${outra}/${HASH}.jpg`), ORG)).toBeNull();
    expect(caminhoDaMidiaDoFluxo(assinada(`${ORG}/${HASH}.jpg`, "whatsapp-media"), ORG)).toBeNull();
    expect(caminhoDaMidiaDoFluxo(assinada(`${ORG}/../${HASH}.jpg`), ORG)).toBeNull();
    expect(caminhoDaMidiaDoFluxo(assinada(`${ORG}/${HASH}.exe`), ORG)).toBeNull();
    expect(caminhoDaMidiaDoFluxo(assinada(`${ORG}/curto.jpg`), ORG)).toBeNull();
  });
  it("não confunde URL de provedor externo nem texto qualquer", () => {
    expect(caminhoDaMidiaDoFluxo("https://zernio.com/api/v1/whatsapp/media/123?accountId=1", ORG)).toBeNull();
    expect(caminhoDaMidiaDoFluxo("não é url", ORG)).toBeNull();
    expect(caminhoDaMidiaDoFluxo(null, ORG)).toBeNull();
  });
});
