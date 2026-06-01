-- Extend inquiry_messages.message_kind to support booking lifecycle cards.
--
-- The money story in the thread already has offer_event / payment_request /
-- payment_paid. This adds the booking-confirmation card emitted when a client's
-- payment settles (markPaid), and a talent_rate_confirmed card for the talent's
-- own rate confirmation — both rendered as structured chat cards, role-aware.
--
-- Idempotent: drop + re-add the CHECK with the widened value set.

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
    'admin_suggested_talent'::text
  ]));
