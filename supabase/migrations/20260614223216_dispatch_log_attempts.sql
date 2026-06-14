-- notification_dispatch_log: per-row retry counter.
--
-- The failed-email retry cron (lib/notifications/retry.ts) previously bounded
-- retries only by age (24 h). Without a counter, a row that keeps failing is
-- re-tried every hour for a full day. This column lets the cron enforce a hard
-- MAX_ATTEMPTS cap (stop retrying after N tries regardless of age) and gives the
-- email console visibility into how many times a send has been attempted.
--
-- Backfill: existing rows default to 0 (treated as "not yet retried"), so the
-- first cron pass after this migration retries them once and starts counting.

ALTER TABLE public.notification_dispatch_log
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.notification_dispatch_log.attempts IS
  'Number of send attempts made by the retry cron. Caps automatic retries at MAX_ATTEMPTS (lib/notifications/retry.ts). The manual console Retry button ignores the cap.';
