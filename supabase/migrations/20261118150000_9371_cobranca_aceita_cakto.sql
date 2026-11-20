-- manifest: **A cobrança do revendedor aceita a Cakto como provedor.** Alargamento puro de três regras que listavam `stripe` e `asaas`: `cobranca_assinaturas.provedor` (CHECK), `webhook_events_log_provider_check` (CHECK) e o índice único parcial `uniq_webhook_events_log_cobranca`. Nenhuma linha existente muda; sem backfill. Gate: `tests/invariants/vocabulario-banco-x-typescript.test.ts`.

alter table public.cobranca_assinaturas
  drop constraint if exists cobranca_assinaturas_provedor_check;
alter table public.cobranca_assinaturas
  add constraint cobranca_assinaturas_provedor_check check (provedor in ('stripe', 'asaas', 'cakto'));

alter table public.webhook_events_log
  drop constraint if exists webhook_events_log_provider_check;
alter table public.webhook_events_log
  add constraint webhook_events_log_provider_check check (provider in (
    'waha', 'nuvemshop', 'generic', 'meta_cloud', 'zernio', 'zernio_social',
    'datafy', 'stripe', 'asaas', 'cakto'
  ));

drop index if exists public.uniq_webhook_events_log_cobranca;
create unique index uniq_webhook_events_log_cobranca
  on public.webhook_events_log (provider, external_id)
  where provider in ('stripe', 'asaas', 'cakto');
