-- manifest: Radar comercial opt-in por organização, evidência referenciada à mensagem, análise idempotente e pausa retomável. Leitura segue a visibilidade da conversa; segredos da Sexta-Feira não entram no CRM.
create table if not exists public.radar_config (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  enabled boolean not null default false,
  auto_pause boolean not null default false,
  notify_sexta boolean not null default false,
  enabled_since timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.radar_config enable row level security;
drop policy if exists radar_config_read on public.radar_config;
create policy radar_config_read on public.radar_config for select to authenticated
using (organization_id in (select public.fn_user_org_ids()));
drop policy if exists radar_config_write on public.radar_config;
create policy radar_config_write on public.radar_config for all to authenticated
using (public.fn_user_role_in_org(organization_id) in ('admin','manager'))
with check (public.fn_user_role_in_org(organization_id) in ('admin','manager'));
revoke all on public.radar_config from public,anon,authenticated;
grant select,insert,update on public.radar_config to authenticated;
grant all on public.radar_config to service_role;

create table if not exists public.radar_analises (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  message_id uuid not null unique references public.messages(id) on delete cascade,
  service_revision bigint not null,
  status text not null default 'processing' check (status in ('processing','done','failed')),
  claim_token uuid not null default gen_random_uuid(),
  claimed_until timestamptz,
  category text not null default 'nenhum' check (category in ('nenhum','interesse','duvida','compra','negociacao','humano')),
  confidence text not null default 'baixa' check (confidence in ('baixa','media','alta')),
  source_hash text,
  excerpt_start integer not null default 0 check (excerpt_start>=0),
  excerpt_length integer not null default 0 check (excerpt_length between 0 and 500),
  pause_status text not null default 'none' check (pause_status in ('none','pending','paused','stale','failed')),
  notify_status text not null default 'disabled' check (notify_status in ('disabled','pending','sending','sent','unknown','failed','suppressed')),
  notification_id text,
  notification_at timestamptz,
  error_code text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists radar_analises_org_time on public.radar_analises(organization_id,created_at desc);
alter table public.radar_analises enable row level security;
drop policy if exists radar_analises_read on public.radar_analises;
create policy radar_analises_read on public.radar_analises for select to authenticated using (
  organization_id in (select public.fn_user_org_ids()) and exists (
    select 1 from public.conversations c where c.id=conversation_id and c.organization_id=radar_analises.organization_id
  ) and exists (select 1 from public.messages m where m.id=message_id and m.organization_id=radar_analises.organization_id)
);
drop policy if exists radar_analises_resolve on public.radar_analises;
create policy radar_analises_resolve on public.radar_analises for update to authenticated using (
  public.fn_user_role_in_org(organization_id) in ('admin','manager','agent') and exists (
    select 1 from public.conversations c where c.id=conversation_id and c.organization_id=radar_analises.organization_id
  )
) with check (public.fn_user_role_in_org(organization_id) in ('admin','manager','agent'));
revoke all on public.radar_analises from public,anon,authenticated;
grant select on public.radar_analises to authenticated;
grant update(resolved_at) on public.radar_analises to authenticated;
grant all on public.radar_analises to service_role;

create or replace function public.fn_radar_claim(p_org uuid,p_message uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare m public.messages; c public.conversations; cfg public.radar_config; token uuid;
begin
  select * into cfg from radar_config where organization_id=p_org and enabled;
  if not found then return null; end if;
  select * into m from messages where id=p_message and organization_id=p_org and direction='inbound';
  if not found or m.created_at<cfg.enabled_since or m.service_revision is null then return null; end if;
  select * into c from conversations where id=m.conversation_id and organization_id=p_org;
  if not found or c.service_revision<>m.service_revision or c.status in ('closed','resolved','archived') or c.is_group then return null; end if;
  insert into radar_analises(organization_id,conversation_id,message_id,service_revision,claimed_until)
  values(p_org,c.id,m.id,c.service_revision,now()+interval '90 seconds')
  on conflict(message_id) do update set claim_token=gen_random_uuid(),claimed_until=now()+interval '90 seconds',updated_at=now()
  where radar_analises.status='processing' and radar_analises.claimed_until<now()
  returning claim_token into token;
  return token;
end $$;

create or replace function public.fn_radar_finish(p_org uuid,p_message uuid,p_token uuid,p_hash text,p_result jsonb,p_error text default null) returns boolean
language plpgsql security definer set search_path=public as $$
declare a public.radar_analises; c public.conversations; cfg public.radar_config; cat text;
begin
  select * into a from radar_analises where organization_id=p_org and message_id=p_message and claim_token=p_token and status='processing' for update;
  if not found then return false; end if;
  select * into c from conversations where id=a.conversation_id and organization_id=p_org for update;
  select * into cfg from radar_config where organization_id=p_org;
  cat:=coalesce(p_result->>'categoria','nenhum');
  if not coalesce(cfg.enabled,false) or c.service_revision<>a.service_revision or c.status in ('closed','resolved','archived') then cat:='nenhum'; end if;
  update radar_analises set status=case when p_error is null then 'done' else 'failed' end,
    category=cat,confidence=coalesce(p_result->>'confianca','baixa'),source_hash=p_hash,
    excerpt_start=coalesce((p_result->>'trecho_inicio')::integer,0),excerpt_length=coalesce((p_result->>'trecho_tamanho')::integer,0),
    pause_status=case when cat<>'nenhum' and cfg.auto_pause and coalesce((p_result->>'pedir_pausa')::boolean,false)
      and not exists(select 1 from messages newer join messages source on source.id=a.message_id
        where newer.organization_id=p_org and newer.conversation_id=a.conversation_id
          and newer.created_at>source.created_at and (newer.direction='inbound' or newer.sent_by_user_id is not null)) then 'pending' else 'none' end,
    notify_status=case when cat='nenhum' or not cfg.notify_sexta then 'disabled'
      when exists(select 1 from radar_analises x where x.organization_id=p_org and x.conversation_id=a.conversation_id
        and x.service_revision=a.service_revision and x.category=cat and x.id<>a.id and x.status='done'
        and x.notify_status in ('pending','sending','sent','unknown') and x.created_at>now()-interval '30 minutes') then 'suppressed'
      else 'pending' end,
    claimed_until=null,error_code=p_error,updated_at=now() where id=a.id;
  return true;
end $$;

-- Libera somente a trava própria de uma tentativa abortada que não pausou inscrições.
create or replace function public.fn_radar_abort_pause(p_org uuid,p_conversation uuid,p_radar uuid) returns void
language plpgsql security definer set search_path=public as $$
declare c public.conversations; state jsonb;
begin
  select * into c from conversations where id=p_conversation and organization_id=p_org for update;
  state:=c.metadata->'radar_pause_state';
  if state->>'id' is distinct from p_radar::text then return; end if;
  update conversations set metadata=metadata-'radar_pause_pending' where id=c.id and organization_id=p_org;
  if exists(select 1 from followup_enrollments e join followup_enrollment_events ev on ev.enrollment_id=e.id
      and ev.organization_id=p_org and ev.event_type='paused_manual' and ev.payload->>'radar_id'=p_radar::text
      where e.organization_id=p_org and e.conversation_id=c.id and e.status='paused_manual') then return; end if;
  if c.bot_silenced_until='infinity'::timestamptz and c.last_handoff_at=(state->>'at')::timestamptz
     and c.assigned_to_user_id is not distinct from (state->>'assigned_before')::uuid then
    update conversations set bot_silenced_until=(state->>'bot_before')::timestamptz,
      last_handoff_at=(state->>'handoff_before')::timestamptz,
      metadata=metadata-'radar_pause_state'-'radar_pause_pending' where id=c.id and organization_id=p_org;
  else
    update conversations set metadata=metadata-'radar_pause_state'-'radar_pause_pending' where id=c.id and organization_id=p_org;
  end if;
end $$;
revoke all on function public.fn_radar_abort_pause(uuid,uuid,uuid) from public,anon,authenticated;

-- Usa os mesmos estados/evento da pausa nativa, na mesma transação. Não move nó nem conta passo.
create or replace function public.fn_radar_pause(p_org uuid,p_message uuid) returns text
language plpgsql security definer set search_path=public set statement_timeout='4s' as $$
declare a public.radar_analises; c public.conversations; e public.followup_enrollments; busy boolean:=false;
begin
  select * into a from radar_analises where organization_id=p_org and message_id=p_message for update;
  if not found or a.pause_status<>'pending' then return coalesce(a.pause_status,'none'); end if;
  select * into c from conversations where id=a.conversation_id and organization_id=p_org for update;
  if c.service_revision<>a.service_revision or c.status in ('closed','resolved','archived') or a.resolved_at is not null
     or not exists(select 1 from radar_config where organization_id=p_org and enabled and auto_pause)
     or exists(select 1 from contacts where id=c.contact_id and organization_id=p_org and (is_anonymized or is_blocked or ai_opt_out))
     or exists(select 1 from messages where id=a.message_id and body='[mensagem anonimizada]') then
    update radar_analises set pause_status='stale',updated_at=now() where id=a.id;
    perform fn_radar_abort_pause(p_org,c.id,a.id);
    return 'stale';
  end if;
  -- Retentativa não pode sobrescrever uma intervenção humana mais recente.
  if c.metadata ? 'radar_pause_state' and (
      c.metadata->'radar_pause_state'->>'id' is distinct from a.id::text
      or c.bot_silenced_until is distinct from 'infinity'::timestamptz
      or c.last_handoff_at is distinct from (c.metadata->'radar_pause_state'->>'at')::timestamptz
      or c.assigned_to_user_id is distinct from (c.metadata->'radar_pause_state'->>'assigned_before')::uuid) then
    update radar_analises set pause_status='stale',updated_at=now() where id=a.id;
    perform fn_radar_abort_pause(p_org,c.id,a.id);
    return 'stale';
  end if;
  -- Silencia o agente já nesta transação, sem mandar aviso ao cliente nem liberar público.
  update conversations set bot_silenced_until='infinity',last_handoff_at=coalesce((metadata->'radar_pause_state'->>'at')::timestamptz,now()),
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('radar_pause_pending',true,
      'radar_pause_state',coalesce(metadata->'radar_pause_state',jsonb_build_object(
        'id',a.id,'at',now(),'bot_before',bot_silenced_until,'handoff_before',last_handoff_at,'assigned_before',assigned_to_user_id)))
    where id=c.id and organization_id=p_org and not (coalesce(metadata,'{}'::jsonb) ? 'radar_pause_state');
  for e in select * from followup_enrollments where organization_id=p_org and conversation_id=c.id
      and status in ('active','waiting_reply') for update loop
    if e.claimed_until is not null and e.claimed_until>now() then busy:=true; continue; end if;
    update followup_enrollments set status='paused_manual',next_eval_at=null,claimed_until=null,updated_at=now() where id=e.id;
    insert into followup_enrollment_events(organization_id,enrollment_id,node_id,event_type,payload)
    values(p_org,e.id,e.current_node_id,'paused_manual',jsonb_build_object(
      'prior_status',e.status,'prior_next_eval_at',e.next_eval_at,
      'restante_ms',greatest(0,coalesce(extract(epoch from (e.next_eval_at-now()))*1000,0)),
      'origin','radar_comercial','radar_id',a.id));
  end loop;
  if busy and a.created_at<now()-interval '3 minutes' then
    update radar_analises set pause_status='failed',error_code='radar_pause_busy',updated_at=now() where id=a.id;
    perform fn_radar_abort_pause(p_org,c.id,a.id);
    return 'failed';
  end if;
  update radar_analises set pause_status=case when busy then 'pending' else 'paused' end,updated_at=now() where id=a.id;
  if not busy then update conversations set metadata=metadata-'radar_pause_pending' where id=c.id and organization_id=p_org; end if;
  return case when busy then 'pending' else 'paused' end;
end $$;
revoke all on function public.fn_radar_claim(uuid,uuid),public.fn_radar_finish(uuid,uuid,uuid,text,jsonb,text),public.fn_radar_pause(uuid,uuid) from public,anon,authenticated;
grant execute on function public.fn_radar_claim(uuid,uuid),public.fn_radar_finish(uuid,uuid,uuid,text,jsonb,text),public.fn_radar_pause(uuid,uuid) to service_role;

-- Retomar pelo botão nativo também libera somente o silêncio que ESTE Radar criou.
create or replace function public.fn_radar_resume_flow() returns trigger
language plpgsql security definer set search_path=public as $$
declare c public.conversations; state jsonb; pause_event jsonb;
begin
  if old.status<>'paused_manual' or new.status not in ('active','waiting_reply') then return new; end if;
  select payload into pause_event from followup_enrollment_events where organization_id=new.organization_id
    and enrollment_id=new.id and event_type='paused_manual' order by created_at desc limit 1;
  if pause_event->>'origin' is distinct from 'radar_comercial' then return new; end if;
  select * into c from conversations where id=new.conversation_id and organization_id=new.organization_id for update;
  state:=c.metadata->'radar_pause_state';
  if state->>'id' is distinct from pause_event->>'radar_id' then return new; end if;
  if c.bot_silenced_until='infinity'::timestamptz and c.last_handoff_at=(state->>'at')::timestamptz
     and c.assigned_to_user_id is not distinct from (state->>'assigned_before')::uuid then
    update conversations set bot_silenced_until=(state->>'bot_before')::timestamptz,
      last_handoff_at=(state->>'handoff_before')::timestamptz,
      metadata=metadata-'radar_pause_state'-'radar_pause_pending' where id=c.id and organization_id=new.organization_id;
  else
    update conversations set metadata=metadata-'radar_pause_state'-'radar_pause_pending' where id=c.id and organization_id=new.organization_id;
  end if;
  return new;
end $$;
revoke all on function public.fn_radar_resume_flow() from public,anon,authenticated;
drop trigger if exists tr_radar_resume_flow on public.followup_enrollments;
create trigger tr_radar_resume_flow after update of status on public.followup_enrollments
for each row execute function public.fn_radar_resume_flow();
