-- manifest: O arquivo durável de webhooks também aceita `zernio_social`, alinhando o CHECK ao provedor de canal já suportado. Alargamento puro; sem backfill, replay ou mudança no envio.

alter table public.webhook_events_log
  drop constraint if exists webhook_events_log_provider_check;

alter table public.webhook_events_log
  add constraint webhook_events_log_provider_check check (provider in (
    'waha', 'nuvemshop', 'generic', 'meta_cloud', 'zernio', 'zernio_social',
    'datafy', 'stripe', 'asaas'
  ));
