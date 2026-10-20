-- TUL-1344 slice 0: additive columns for the dated-places engine (dated offerings with seats).
--
-- HELD: lives in _pending_pm until the Production Migration Manager applies it after merge.
-- All code that reads or writes these columns works with or without them (it treats a
-- missing column or a null value as "not set": defaults first).
--
-- Additive and idempotent only: nullable or constant-default columns, NO backfill, NO UPDATE,
-- NO RLS or grant change (public reads of these stay on the service-role path; do not add
-- these columns to the anon column grants in 20261231417400 without a separate review).
--
--   session_series.sales_close_minutes  stop selling N minutes before the start (null = at start)
--   sessions.sales_close_at             per-date override of the stop-selling instant
--   session_series.tier_quotas          optional per-tier max per date, {"<pool_key>": <int>}
--   talent_offerings.dated_details_i18n meeting point, program, what to bring, requirements,
--                                       languages, minimum age, included / not included;
--                                       {"<locale>": {"<field>": "..."}}
--   talent_offerings.private_on_request when true a booking is a request, not a seat
--
-- Rollback (only if no row has written these yet):
--   ALTER TABLE public.talent_offerings
--     DROP COLUMN IF EXISTS dated_details_i18n,
--     DROP COLUMN IF EXISTS private_on_request;
--   ALTER TABLE public.sessions DROP COLUMN IF EXISTS sales_close_at;
--   ALTER TABLE public.session_series
--     DROP COLUMN IF EXISTS sales_close_minutes,
--     DROP COLUMN IF EXISTS tier_quotas;

BEGIN;

ALTER TABLE public.session_series
  ADD COLUMN IF NOT EXISTS sales_close_minutes integer,
  ADD COLUMN IF NOT EXISTS tier_quotas jsonb;

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS sales_close_at timestamptz;

ALTER TABLE public.talent_offerings
  ADD COLUMN IF NOT EXISTS dated_details_i18n jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS private_on_request boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'session_series_sales_close_minutes_chk'
  ) THEN
    ALTER TABLE public.session_series
      ADD CONSTRAINT session_series_sales_close_minutes_chk
      CHECK (sales_close_minutes IS NULL OR (sales_close_minutes >= 0 AND sales_close_minutes <= 525600));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'session_series_tier_quotas_object_chk'
  ) THEN
    ALTER TABLE public.session_series
      ADD CONSTRAINT session_series_tier_quotas_object_chk
      CHECK (tier_quotas IS NULL OR jsonb_typeof(tier_quotas) = 'object');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'talent_offerings_dated_details_object_chk'
  ) THEN
    ALTER TABLE public.talent_offerings
      ADD CONSTRAINT talent_offerings_dated_details_object_chk
      CHECK (jsonb_typeof(dated_details_i18n) = 'object');
  END IF;
END $$;

COMMIT;
