-- TUL-1020: deleting an auth user failed ("Database error deleting user") when
-- the user had support tickets. requester_user_id is ON DELETE SET NULL, but the
-- CHECK support_tickets_requester_present (requester_user_id OR guest_session_id)
-- then rejected the nulled row, aborting the whole delete.
--
-- The rule only matters when a ticket is CREATED. Keep it for inserts via a
-- trigger and drop the CHECK, so later account deletion can orphan the ticket
-- (ticket history is kept; requester shows as deleted).

alter table public.support_tickets
  drop constraint if exists support_tickets_requester_present;

create or replace function public.support_tickets_require_requester_on_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.requester_user_id is null and new.guest_session_id is null then
    raise exception 'support ticket needs a requester (user or guest session)'
      using errcode = '23514', constraint = 'support_tickets_requester_present';
  end if;
  return new;
end;
$$;

revoke all on function public.support_tickets_require_requester_on_insert() from public, anon, authenticated;

drop trigger if exists support_tickets_require_requester on public.support_tickets;
create trigger support_tickets_require_requester
  before insert on public.support_tickets
  for each row execute function public.support_tickets_require_requester_on_insert();
