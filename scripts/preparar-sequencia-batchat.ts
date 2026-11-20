/** Uso: tsx scripts/preparar-sequencia-batchat.ts --source ARQUIVO --media-root PASTA --output PASTA_NOVA */
import { parseArgs } from "node:util";
import { z } from "zod";
import { prepararPacoteLocal } from "../lib/followup/importacao/pacote-local";

async function main() {
  const { values } = parseArgs({
    options: {
      source: { type: "string" },
      "media-root": { type: "string" },
      output: { type: "string" },
    },
  });
  const args = z
    .strictObject({
      source: z.string().min(1),
      "media-root": z.string().min(1),
      output: z.string().min(1),
    })
    .parse(values);
  const manifest = await prepararPacoteLocal({
    sourceFile: args.source,
    mediaRoot: args["media-root"],
    outputDirectory: args.output,
  });
  process.stdout.write(JSON.stringify(manifest) + "\n");
}
main().catch(() => {
  console.error(
    "Preparação recusada: confira estrutura, caminhos, integridade dos anexos e se a pasta de destino é nova. Nenhum fluxo foi ativado.",
  );
  process.exitCode = 1;
});
