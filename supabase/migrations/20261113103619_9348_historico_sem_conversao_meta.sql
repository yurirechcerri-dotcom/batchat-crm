-- manifest: Historico importado nao captura clique CTWA nem gera despacho Meta; mensagens vivas preservam o fluxo existente.

create or replace function public.fn_record_meta_ctwa_click() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_clid text;
  v_activation timestamptz;
  v_at timestamptz;
  v_sent_legacy boolean;
  v_id uuid := gen_random_uuid();
begin
  -- Historico conserva a mensagem, mas nao registra conversao nem reserva o clique.
  if coalesce(new.metadata->>'historico_importado', '') = 'true' then
    return new;
  end if;
  if new.direction <> 'inbound'
     or new.metadata->'meta_ctwa_message_v1'->>'platform' is distinct from 'meta_ads'
     or new.metadata->'meta_ctwa_message_v1'->>'source_type' is distinct from 'ad' then
    return new;
  end if;
  v_clid := new.metadata->'meta_ctwa_message_v1'->>'ctwa_clid';
  if v_clid is null or v_clid <> btrim(v_clid) or length(v_clid) not between 1 and 512 then
    return new;
  end if;
  if not exists (select 1 from public.contacts c
      where c.id=new.contact_id and c.organization_id=new.organization_id)
     or not exists (select 1 from public.conversations c
      where c.id=new.conversation_id and c.organization_id=new.organization_id
        and c.contact_id=new.contact_id and c.channel='whatsapp') then
    -- A ancora valida exige escopo valido. Falhar reverte mensagem e evento
    -- juntos; aceitar a mensagem aqui perderia o clique silenciosamente.
    raise exception 'meta_ctwa_click_scope_mismatch';
  end if;
  -- O lock ordena captura e toggle da organizacao, ambos no relogio do banco.
  select o.meta_lead_birth_enabled_at into v_activation
    from public.organizations o where o.id=new.organization_id for share;
  v_at := clock_timestamp();
  v_sent_legacy := public.fn_meta_ctwa_click_enviado_legado(new.organization_id,v_clid);
  insert into public.meta_ctwa_click_dispatches
    (id,organization_id,contact_id,first_message_id,ctwa_clid,captured_at,
     activation_at_capture,status,reason,event_id)
  values (v_id,new.organization_id,new.contact_id,new.id,v_clid,v_at,
    v_activation,
    case when v_sent_legacy or v_activation is null or v_at<=v_activation
      then 'skipped' else 'pending' end,
    case when v_sent_legacy then 'lead_submitted_legado_enviado'
      when v_activation is null or v_at<=v_activation then 'lead_submitted_desativado'
      else null end,
    v_id::text||':LeadSubmitted')
  on conflict (organization_id,ctwa_clid) do nothing;
  return new;
end;
$$;
revoke execute on function public.fn_record_meta_ctwa_click() from public, anon, authenticated;
grant execute on function public.fn_record_meta_ctwa_click() to service_role;
