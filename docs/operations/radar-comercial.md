# Radar comercial

CONFIRMADO no código: recurso do núcleo opt-in por organização, independente do
Alfred. Sem ativação, o atendimento comum continua igual. Entrada `message.received`
do atendimento vigente → claim por mensagem → modelo `radar_comercial` → validação
literal/determinística → sinal e eventual pausa → tela com RLS → ponte privada Sexta.

## Operação

Em `/app/radar`, admin/manager controla análise, pausa e aviso. Agentes consultam
somente conversas visíveis e resolvem alertas. O trecho não é copiado para outra
tabela: hash e posição referenciam a mensagem; alteração/redação oculta a evidência.

Interesse e dúvida preservam o fluxo. Compra, negociação e pedido de humano exigem
alta confiança e expressão explícita fora de negação/hipótese/citação para pausar.
São sinais probabilísticos; não substituem leitura humana. Cada análise lê até oito
falas anteriores e 6000 caracteres atuais. Áudio só entra após transcrição pronta.
Modelo/custo ficam em Provedores e no registro de uso `radar_comercial`.

A pausa usa `paused_manual`, guarda nó/prazo e silencia o agente. Motor ocupado gera
pendência de até três minutos, depois falha visível. Tentativa abortada remove apenas
sua trava quando não pausou inscrição; intervenção humana posterior é preservada.
Retomar pelo controle nativo libera somente o silêncio pertencente ao Radar.
**Já cuidei** resolve o alerta e não libera o atendimento. STOP continua independente.
Não há garantia de cancelar um envio que já foi aceito pelo transporte.

## Sexta-Feira privada da operação

`scripts/radar-sexta-notify.py` roda no host via systemd, a cada 15 segundos, com
organização/operador/destino fixos. Lê o segredo já existente do Hermes sem copiá-lo
para o CRM. Confere bot, chat privado e vínculo administrativo do operador.

Estados: pending → sending → sent/failed/unknown. Timeout não reenvia cegamente;
`unknown` exige conferir a Sexta. Categoria repetida na mesma conversa tem janela
mínima de 30 minutos; cada mensagem mantém seu sinal no Radar. Alerts antigos,
resolvidos, anonimizados ou de outro atendimento não são enviados.
Telegram aceitar `sendMessage` não prova notificação push ou leitura.
Referência: https://core.telegram.org/bots/api#sendmessage

Instalação específica BrainADS: script em `/opt/deskcommcrm-ops/radar-sexta-notify.py`,
serviço `deskcomm-radar-sexta.service`, timer `deskcomm-radar-sexta.timer`.
`systemctl status deskcomm-radar-sexta.timer` e `journalctl -u deskcomm-radar-sexta`
mostram execução sem conteúdo das conversas ou token. Desligar Avisar na Sexta no
Radar bloqueia novas reservas; desligar o timer interrompe a ponte.

## Limites de verificação

Testes locais: contrato, interface desktop/celular, reatividade híbrida e registro
de ponto IA. SQL real com rollback: isolamento, ACL, claim único, pausa/retomada,
motor ocupado, revogação, timeout e intervenção humana posterior. Classificação
real exercitada com oito cenários sintéticos e reteste dirigido da negociação.
Notificação privada de teste aceita pelo Telegram. Esses testes isolados não
comprovam todos os comportamentos possíveis de uma conversa real.
