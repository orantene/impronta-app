-- Appointments P1 PR-7: reservation card in the inquiry thread.
-- Widens inquiry_messages.message_kind. Idempotent drop + re-add.

alter table public.inquiry_messages
  drop constraint if exists inquiry_messages_message_kind_check;

alter table public.inquiry_messages
  add constraint inquiry_messages_message_kind_check
  check (message_kind = any (array[
    'text'::text,
    'offer_event'::text,
    'payment_request'::text,
    'payment_paid'::text,
    'booking_confirmed'::text,
    'talent_rate_confirmed'::text,
    'coordinator_request'::text,
    'talent_rate'::text,
    'call_sheet_update'::text,
    'booking_status'::text,
    'system_event'::text,
    'admin_suggested_talent'::text,
    'balance_due'::text,
    'reservation'::text
  ]));
