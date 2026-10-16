-- Applied to prod 2026-10-14 (or earlier); file landed for ledger parity (no re-apply needed).
-- Adds the `system_alerts` kind (platform/system alerts such as usage quota and
-- signup failures) to the notification email copies allowed-kinds CHECK.
alter table public.notification_email_copies
  drop constraint if exists notification_email_copies_kinds_allowed;
alter table public.notification_email_copies
  add constraint notification_email_copies_kinds_allowed
  check (kinds <@ array['support_new','support_urgent','support_inbound','leads','payment_issues','system_alerts']::text[]);
