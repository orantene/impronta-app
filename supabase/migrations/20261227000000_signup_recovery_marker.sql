-- Signup recovery: one durable marker so a lead is never mailed twice.
--
-- A visitor who fills in the signup form and never finishes leaves a row in
-- `saas_marketing_signups` with a null `provisioned_tenant_id`. Nothing ever
-- followed up, and nothing recorded that we tried.
--
-- The marker lives on the row rather than in a separate ledger because the
-- question it answers is a property of the lead ("have we reached out about
-- this one"), and because a cron that reads and writes the same row cannot
-- drift out of sync with a side table.
--
-- Nullable with no default: null means never contacted, which is the correct
-- starting state for every row that already exists.
alter table public.saas_marketing_signups
  add column if not exists recovery_email_sent_at timestamptz;

comment on column public.saas_marketing_signups.recovery_email_sent_at is
  'When the abandoned-signup recovery email was sent. Null means never contacted. Set by /api/cron/signup-recovery; the cron skips any row where this is non-null, so it is the idempotency key for that job.';

-- The cron selects abandoned, never-contacted, sufficiently-old rows. Without
-- this it is a full scan on a table that only grows.
create index if not exists saas_marketing_signups_recovery_pending_idx
  on public.saas_marketing_signups (created_at)
  where provisioned_tenant_id is null and recovery_email_sent_at is null;
