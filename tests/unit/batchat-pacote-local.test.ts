// @vitest-environment node
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prepararPacoteLocal } from "@/lib/followup/importacao/pacote-local";

let root: string;
const data = Buffer.from("synthetic audio");
const hash = createHash("sha256").update(data).digest("hex");
const source = (mediaPath = "audio.ogg", digest = hash) =>
  JSON.stringify({
    sequence: {
      id: "test",
      start: "a",
      defaults: {},
      steps: [
        {
          id: "a",
          kind: "message",
          text: "",
          next: null,
          voiceNote: true,
          attachment: { name: "audio.ogg", mime: "audio/ogg", size: data.length, sha256: digest },
        },
      ],
    },
    mediaBase: "test",
    mediaFiles: { a: mediaPath },
  });
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "batchat-package-"));
  await writeFile(join(root, "audio.ogg"), data);
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});
async function prepare(raw = source()) {
  await writeFile(join(root, "source.json"), raw);
  return prepararPacoteLocal({
    sourceFile: join(root, "source.json"),
    mediaRoot: root,
    outputDirectory: join(root, "package"),
  });
}
describe("pacote privado de fonte", () => {
  it("copia bytes exatos com permissões privadas, sem produzir fluxo executável", async () => {
    const manifest = await prepare();
    expect(await readFile(join(root, "package/source.json"), "utf8")).toBe(source());
    expect(await readFile(join(root, "package/media", hash))).toEqual(data);
    expect((await stat(join(root, "package"))).mode & 0o777).toBe(0o700);
    expect((await stat(join(root, "package/source.json"))).mode & 0o777).toBe(0o600);
    expect(manifest).toMatchObject({ nativeDraft: false, activationAllowed: false });
  });
  it("arquivo divergente impede criação do pacote", async () => {
    await expect(prepare(source("audio.ogg", "0".repeat(64)))).rejects.toThrow(
      "media_integrity_mismatch",
    );
    await expect(stat(join(root, "package"))).rejects.toMatchObject({ code: "ENOENT" });
  });
  it("recusa mídia ausente", async () => {
    await expect(prepare(source("missing.ogg"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(stat(join(root, "package"))).rejects.toMatchObject({ code: "ENOENT" });
  });
  it("symlink não permite ler fora da pasta autorizada", async () => {
    const external = await mkdtemp(join(tmpdir(), "batchat-outside-"));
    try {
      await writeFile(join(external, "file.ogg"), data);
      await symlink(join(external, "file.ogg"), join(root, "link.ogg"));
      await expect(prepare(source("link.ogg"))).rejects.toThrow("media_outside_root");
    } finally {
      await rm(external, { recursive: true, force: true });
    }
  });
  it("recusa sobrescrever destino existente", async () => {
    await prepare();
    await expect(prepare()).rejects.toMatchObject({ code: "EEXIST" });
    expect(await readFile(join(root, "package/source.json"), "utf8")).toBe(source());
  });
});
