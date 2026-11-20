import { createHash } from "node:crypto";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";
import { prepararSequenciaLegada } from "./sequencia-legada";

const sha256 = (value: Buffer) => createHash("sha256").update(value).digest("hex");
/** Somente arquivos locais; nunca usa rede, segredos, banco ou runtime do agente. */
export async function prepararPacoteLocal(input: {
  sourceFile: string;
  mediaRoot: string;
  outputDirectory: string;
}) {
  const raw = await readFile(input.sourceFile);
  const prepared = prepararSequenciaLegada(JSON.parse(raw.toString("utf8")));
  const root = await realpath(input.mediaRoot);
  const assets: Array<{
    stepId: string;
    sha256: string;
    bytes: number;
    file: string;
    data: Buffer;
  }> = [];
  for (const s of prepared.source.sequence.steps) {
    if (s.kind !== "message" || !s.attachment) continue;
    const path = await realpath(join(root, prepared.source.mediaFiles[s.id]!));
    const scoped = relative(root, path);
    if (isAbsolute(scoped) || scoped === ".." || scoped.startsWith(`..${sep}`))
      throw new Error("media_outside_root");
    const data = await readFile(path);
    const hash = sha256(data);
    if (data.length !== s.attachment.size || hash !== s.attachment.sha256)
      throw new Error("media_integrity_mismatch");
    assets.push({ stepId: s.id, sha256: hash, bytes: data.length, file: `media/${hash}`, data });
  }
  // Só cria depois de validar tudo. Diretório existente é recusado: nunca
  // sobrescrever a copy ou um pacote de uma execução anterior.
  await mkdir(input.outputDirectory, { mode: 0o700 });
  await mkdir(join(input.outputDirectory, "media"), { mode: 0o700 });
  for (const a of new Map(assets.map((a) => [a.sha256, a])).values())
    await writeFile(join(input.outputDirectory, a.file), a.data, { mode: 0o600, flag: "wx" });
  const manifest = {
    format: "batchat-source-preparation-v1",
    sourceSha256: sha256(raw),
    nativeDraft: false,
    activationAllowed: false,
    assets: assets.map(({ data: _data, ...metadata }) => metadata),
    report: prepared.report,
  };
  await writeFile(join(input.outputDirectory, "source.json"), raw, { mode: 0o600, flag: "wx" });
  await writeFile(
    join(input.outputDirectory, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
    { mode: 0o600, flag: "wx" },
  );
  return manifest;
}
