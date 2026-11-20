# scripts/

CLI utilities pra operação local e de produção.

## Lista

- `seed-tenant.ts` — Cria um tenant manualmente (modo BPO). Placeholder; implementação na Spec 01.
- `preparar-sequencia-batchat.ts` — Preparação local de sequência legada e anexos
  para migração. Argumentos `--source`, `--media-root`, `--output` (pasta nova).
  Valida estrutura/arestas e hash/tamanho das mídias, recusa escape por symlink,
  preserva bytes da fonte, grava pacote privado0600/0700. Não acessa banco/rede,
  não gera FlowGraph executável nem ativa atendimento. Manifesto em stdout não
  contém copy; `source.json` e anexos são privados. Destino com falha parcial não
  deve ser reutilizado: conferir e escolher pasta nova, preservando a origem.

## Convenções

- Todos em TypeScript (executar via `npx tsx scripts/<nome>.ts`)
- Sempre validar input com Zod
- Logar via `console.error` (stderr) pra mensagens operacionais; `console.log` (stdout) só pra output estruturado consumível por pipe
- Operações destrutivas exigem flag `--confirm` ou prompt interativo
- Toda mutação relevante gera entrada em `api_audit_log` com `actor=script:<nome>`
