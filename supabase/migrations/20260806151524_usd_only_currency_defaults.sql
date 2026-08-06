-- USD is the product's only supported currency — fix the EUR DDL defaults.
--
-- Owner ruling (2026-07-11, reaffirmed 2026-08-06): USD is primary across the
-- product (Mexico market + USDC settlement rail); "EUR in the seed data is a
-- bug to fix". The ruling was never applied at the SCHEMA level, so
-- `talent_profiles.default_currency` and `agencies.default_currency` both
-- defaulted to 'EUR' — which put EUR on 140/145 talent profiles nobody ever
-- priced. Harmless while nothing read the column; the Roster→Rates
-- create-on-save (#1012/#1019) was the first reader and faithfully produced a
-- EUR "Day rate" row + EUR labels, surfacing the bug in production QA.
--
-- Scope: DEFAULTS + the rows that only ever held the buggy default. Money
-- records (bookings, offers, transactions, snapshots) are NOT touched — those
-- carry whatever a human actually transacted in. The single MXN profile is
-- also left alone (an explicit choice, not the buggy default).

BEGIN;

ALTER TABLE public.talent_profiles ALTER COLUMN default_currency SET DEFAULT 'USD';
ALTER TABLE public.agencies       ALTER COLUMN default_currency SET DEFAULT 'USD';

-- Profiles/tenants that carry the buggy default (nobody chose EUR — the
-- column did). Priced offerings across the platform are 100% USD, so no
-- displayed price changes from these two updates.
UPDATE public.talent_profiles SET default_currency = 'USD' WHERE default_currency = 'EUR';
UPDATE public.agencies        SET default_currency = 'USD' WHERE default_currency = 'EUR';

-- The one EUR offering in existence: Veleria's "Day rate", created by the
-- rates page while it still honoured the buggy per-talent default. 450 stays
-- 450 — the operator typed the number thinking in dollars.
UPDATE public.talent_offerings
   SET currency = 'USD', updated_at = now()
 WHERE currency = 'EUR';

COMMENT ON COLUMN public.talent_profiles.default_currency IS
  'USD-only product (owner ruling 2026-07-11): defaults to USD; do not reintroduce EUR defaults.';
COMMENT ON COLUMN public.agencies.default_currency IS
  'USD-only product (owner ruling 2026-07-11): defaults to USD; do not reintroduce EUR defaults.';

COMMIT;
