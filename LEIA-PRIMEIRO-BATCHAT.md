# BatChat (versão para rodar a sua própria instalação)

Este repositório é o **BatChat**: um CRM de conversas (WhatsApp e Instagram) com fluxos de mensagem, automações, agente de IA e cobrança por planos. Ele nasceu como uma adaptação do **DeskcommCRM**, de Rafael Melgaço (licença MIT, mantida no arquivo `LICENSE`), e foi modificado: novo visual, caixa de entrada reformulada, fluxos de mensagem, módulo de cobrança (Stripe, Asaas e Cakto), landing de planos e outras mudanças.

O restante do `README.md` descreve o projeto original. Onde houver diferença, vale o que está neste arquivo.

## Estado

- Corresponde à versão que o autor tinha em produção em **18/11/2026** (build `1.109.0-brainads.93`).
- Não há garantia. Rode seus próprios testes antes de colocar clientes reais.
- **Nenhum segredo, chave, dado de cliente ou conversa foi incluído.** Tudo isso você configura na sua instalação.

## O que você precisa trazer

- Um servidor (ou máquina) com Docker, e um banco **Supabase/Postgres 17** (o schema está em `supabase/migrations/`).
- Seu provedor de WhatsApp/Instagram (o BatChat usa o **Zernio**; há também adaptador WAHA e Meta Cloud).
- Seu provedor de pagamento, se for cobrar planos (Stripe, Asaas ou Cakto). Sem isso o módulo de cobrança fica desligado.
- Chaves de IA (OpenRouter ou o provedor que escolher), e-mail transacional (SMTP/Resend) e domínio próprio.

## Como começar

1. Copie `.env.example` para `.env.local` e preencha com **os seus** valores (guia: `docs/SETUP.md`).
2. Variáveis que são específicas desta versão e **você precisa definir**:
   - `NEXT_PUBLIC_WHATSAPP_DE_SUPORTE`: WhatsApp de suporte exibido na landing (só dígitos, com DDI e DDD, ex.: `5511999999999`).
   - `CAKTO_PRODUTO_DOS_PLANOS_ID`: ID do produto na Cakto, se usar a Cakto como provedor de cobrança.
3. Instale e rode os testes:
   ```bash
   pnpm install
   pnpm vitest run
   ```
4. Suba o app conforme `docs/SETUP.md` e `docs/DEPLOY-CHECKLIST.md`.

## O que você vai querer trocar

- **Landing (`app/page.tsx`):** textos, planos, preços e a menção ao treinamento "Bat Academy" são do autor original. Troque pelos seus.
- **Planos:** a tabela `cobranca_planos` define os planos e limites; ajuste valores e limites ao seu negócio.
- **Marca e ícones:** em `public/` e `lib/branding/`.

## Créditos

Base: [DeskcommCRM](https://github.com/melgarafael/DeskcommCRM) por Rafael Melgaço (MIT). Este repositório não é afiliado ao projeto original.
