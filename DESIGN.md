# DESIGN.md — BatChat

Fonte única do visual. Consulte ANTES de mexer em qualquer tela. Origem: kit "BatChat · Sistema de Design" (edição 02: tokens em `batchat-tokens.css`, pranchas 01–24, pareceres de contraste). Os temas do app vêm dos pacotes de tema; este arquivo diz COMO usar, não redefine cores.

## 1. Princípios
1. **Um painel por ideia.** Pouca informação por cartão; o que não ajuda a decidir sai.
2. **Texto manda, cartão serve.** O cartão tem o tamanho do conteúdo + respiro; nunca o contrário.
3. **Âmbar é ação.** `--bc-action` só em botão primário, aba ativa, seleção e foco. Decoração usa `--bc-brand`.
4. **Legível primeiro.** Todo texto ≥ 4.5:1 sobre a superfície onde está. Texto sobre âmbar é sempre `--bc-on-action` (#101216).
5. **Movimento explica, não decora.** 140/240/420 ms, `cubic-bezier(.16,1,.3,1)`, respeita "reduzir movimento".

## 2. Tokens (nomes do kit)
- Cores: `--bc-bg` #101216 · `--bc-panel` #20242A · `--bc-surface` #2B3037 · `--bc-text` #F6F4EE · `--bc-muted` #BCC2C9 · `--bc-brand/--bc-action` #FFB52C · `--bc-accent` #FFD071 (texto âmbar) · `--bc-border` #46505A · controles `--bc-control-border` #8B96A2.
- **Contorno de cartão e divisor no app escuro:** `#363d48` (suave). `#8B96A2` é só para campos e foco.
- Raios: 8 / 12 / **16 (cartão)** / pílula 999. Toque mínimo 44 px (celular).
- Espaço: escala de 4 (4, 8, 12, 16, 20, 24…). Nunca valor solto fora da escala.
- Tipo: 12/16 · 14/20 · 16/24 · 20/28 · 24/32 · 32/40 · 40/48. Mono (`--bc-font-mono`) só em rótulo curto, hora e número.
- Sombras: `--bc-shadow-1…5`. Cartão em repouso = 1; elevado/hover = 2; diálogo = 4.

## 3. Componentes (medidas obrigatórias)
**Cartão de conversa (lista da Inbox, prancha 22/05)**
- Altura natural ≈ 64 px: padding 8×10, gap 10. Avatar **40 px** (iniciais 12/16 semibold, anel âmbar 2 px só na selecionada).
- Linha 1: nome 14/20 semibold (truncate) + hora 11 mono muted à direita. Linha 2: canal 12 em `--bc-accent`. Linha 3: prévia 12/16 muted, 1 linha.
- Não-lida: bolinha/contador 18 px min, `--bc-action` com `--bc-on-action`. Sem caixa de seleção, estrela ou selos à vista (aparecem no hover).
- Selecionada: fundo âmbar 12–14 %, contorno âmbar inteiro de 1 px (50 %) e anel âmbar no avatar. Sem barra lateral grossa (decisão: kit + critique do impeccable).

**Abas segmentadas (Fila · Minhas · Todas)**
- Uma linha, nunca quebra. Pílulas do mesmo tamanho, 12–13 px, altura 32 (44 no toque).
- **Contador dentro da aba:** 12 px, bold, tabular. Aba ativa (âmbar) → número `--bc-on-action` a 85 %. Aba inativa → `--bc-muted`. Nunca `text-subtle` sobre âmbar.

**Botões:** primário = âmbar cheio, texto `--bc-on-action`, pílula ou raio 12. Secundário = texto sem contorno. Um primário por tela.
**Etiquetas (tags):** pílula, 12 px, fundo âmbar 14 % + texto `--bc-accent`; neutra = `--bc-surface`.
**Cartões de painel:** raio 16, contorno suave, sombra 1, padding 16–20. Título 14–16 semibold, apoio 12 muted, no máximo 2 linhas.
**Campos:** altura 40–44, borda `--bc-field-border`, foco 2 px `--bc-focus` afastado 3 px.

## 4. Layout
- Computador 1440: trilho 72 + lista 340 + conversa flexível + contato 320. Tablet: sem painel de contato. Celular 390: uma coluna + barra inferior (5 itens).
- Página interna: título 28–36 mono-free, no máx. uma linha de apoio; conteúdo em grade de 12 colunas, gap 16.
- Barra lateral: no máximo 8 destinos + Configurações + Ajuda. O resto vive em Configurações / ⌘K.

## 5. Proibido
Cartão maior que o texto exige · número ilegível (contraste < 4.5:1) · texto de apoio repetindo o título · duas ações primárias · cor fixa em hex dentro de componente (use token) · animação > 420 ms · ícone sem rótulo em ação destrutiva.

## 6. Antes de entregar (checklist)
1. Conferir a prancha correspondente (05 Inbox, 06 Contatos/Pipeline, 07/24 Editor, 10/23 Celular, 22 Inbox refinada).
2. Medir: altura do cartão, tamanho da fonte, contraste do menor texto (inclusive números dentro de pílula).
3. Ver nas larguras 390, 768 e 1440 — **na tela real**, não só no código.
4. Rodar `tsc` e os testes da pasta mexida; commitar só arquivos próprios.

## 7. Como estender
Componente novo: acrescente aqui a medida (seção 3) ANTES de codar. Se a prancha não cobre, peça uma ao Yuri em vez de inventar.
