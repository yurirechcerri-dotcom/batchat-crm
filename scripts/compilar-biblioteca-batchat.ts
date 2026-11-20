import { readFileSync, writeFileSync, chmodSync } from "node:fs";
import { createHash } from "node:crypto";
import { compilarDocumentoBatchat } from "../lib/followup/importacao/compilar-batchat";

const [documentsPath, mediaPath, linksPath, outputPath] = process.argv.slice(2);
if (!documentsPath || !mediaPath || !linksPath || !outputPath) {
  throw new Error("Uso: documentos.json midias.json links.json saida.json");
}
const read = (path: string) => JSON.parse(readFileSync(path, "utf8")) as unknown;
const docs = read(documentsPath) as { code: string; name: string; document: unknown }[];
const mediaByHash = read(mediaPath) as Record<string, string>;
const linksByAnchor = read(linksPath) as Record<string, string>;
const compiled = docs.map((doc) => ({ code: doc.code, name: doc.name,
  sourceSha256: createHash("sha256").update(JSON.stringify(doc.document)).digest("hex"),
  graph: compilarDocumentoBatchat(doc.document, { mediaByHash, linksByAnchor }),
}));
writeFileSync(outputPath, JSON.stringify(compiled, null, 2), { mode: 0o600 });
chmodSync(outputPath, 0o600);
console.info(JSON.stringify({ sending: false, flows: compiled.map((flow) => ({ code: flow.code,
  nodes: flow.graph.nodes.length, edges: flow.graph.edges.length, sourceSha256: flow.sourceSha256 })) }));
