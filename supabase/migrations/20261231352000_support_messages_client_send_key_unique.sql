-- TUL-315: a duplicate delivery of one Resend inbound email (or a Desk retry)
-- can never append twice. The app already checks findMessageByClientSendKey
-- first; this is the race-proof backstop (two concurrent webhook retries).
--
-- Created only when no ticket already holds two messages with the same send key,
-- so an old duplicate can never make this migration fail the whole push; if one
-- exists the index is skipped with a notice and the check stays app-side.
do $$
begin
  if exists (
    select 1
      from public.support_messages
     where metadata ? 'client_send_key'
     group by ticket_id, metadata ->> 'client_send_key'
    having count(*) > 1
  ) then
    raise notice 'support_messages_client_send_key_uq skipped: duplicate (ticket_id, client_send_key) rows exist';
  else
    create unique index if not exists support_messages_client_send_key_uq
      on public.support_messages (ticket_id, (metadata ->> 'client_send_key'))
      where metadata ? 'client_send_key';
  end if;
end
$$;
