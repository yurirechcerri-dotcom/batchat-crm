-- manifest: Derivacao de midia invalida sugestoes de resposta feitas com contexto anterior, sem enviar mensagens nem reativar automacao.

create or replace function public.fn_reply_media_revision() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.direction = 'inbound' and new.type <> 'reaction'
     and coalesce(new.metadata->>'historico_importado', '') <> 'true' then
    update public.conversations
       set reply_context_revision = reply_context_revision + 1
     where organization_id = new.organization_id and id = new.conversation_id
       and contact_id = new.contact_id and channel_session_id = new.channel_session_id;
  end if;
  return new;
end;
$$;
revoke execute on function public.fn_reply_media_revision() from public, anon, authenticated;
grant execute on function public.fn_reply_media_revision() to service_role;

do $reply_media_trigger$
begin
  drop trigger if exists trg_reply_media_revision on public.messages;
  create trigger trg_reply_media_revision
    after update of media_derived_text, media_derived_status on public.messages
    for each row
    when ((old.media_derived_text, old.media_derived_status)
      is distinct from (new.media_derived_text, new.media_derived_status))
    execute function public.fn_reply_media_revision();
end;
$reply_media_trigger$;

-- Recupera sugestoes anteriores ao gatilho, inclusive descartadas que fn_reply_begin
-- reutilizava. Nao existe data exclusiva de derivacao no schema antigo: updated_at
-- e um limite conservador (pode invalidar uma sugestao a mais, nunca envia nada).
-- So a revisao ainda atual muda; reaplicar nao repete a invalidacao. Sugestoes
-- novas, historico importado e respostas ja enviadas permanecem preservados.
update public.conversations c
   set reply_context_revision = c.reply_context_revision + 1
 where exists (
   select 1 from public.ai_reply_drafts d
    join public.messages m
      on m.organization_id = d.organization_id and m.conversation_id = d.conversation_id
     and m.contact_id = d.contact_id and m.channel_session_id = d.channel_session_id
   where d.organization_id = c.organization_id and d.conversation_id = c.id
     and d.contact_id = c.contact_id and d.channel_session_id = c.channel_session_id
     and d.context_revision = c.reply_context_revision and d.message_id is null
     and d.status in ('generating', 'pending', 'approved', 'failed', 'dismissed')
     and m.direction = 'inbound' and m.type <> 'reaction'
     and coalesce(m.metadata->>'historico_importado', '') <> 'true'
     and (m.media_derived_text is not null or m.media_derived_status is not null)
     and m.created_at <= d.created_at and m.updated_at > d.created_at
 );
