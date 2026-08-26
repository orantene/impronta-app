-- STANDING reviews — flip the platform default to ON.
--
-- Supersedes 20261110060000_reviews_premium_entitlement.sql, which shipped
-- `agency_entitlements.reviews_enabled` as `NOT NULL DEFAULT FALSE` (reviews as
-- a premium capability). The ratified 2026 decision is the opposite: COLLECTING
-- reviews is FREE for every tier. Reviews are marketplace trust data — every
-- review any talent collects makes the whole platform more bookable, so gating
-- collection behind a plan starves the network effect the marketplace runs on.
--
-- Three changes, one migration:
--   1. column DEFAULT flips FALSE -> TRUE, so every NEW tenant row is review-
--      enabled the moment it is created (no provisioning step to forget).
--   2. every EXISTING row is set TRUE. The old default meant essentially every
--      tenant carried FALSE by inheritance rather than by a deliberate platform
--      decision, so there is no operator intent to preserve here.
--   3. the column comment is rewritten so the next reader does not re-derive
--      the old premium story from stale documentation.
--
-- The column stays NOT NULL and platform-write only. It remains a real switch:
-- platform staff can still set a specific tenant FALSE (abuse, a hub that does
-- not want public standing), and `lib/reviews/reviews-entitlement.ts` still
-- reads it per surface tenant.
--
-- NOTE ON THE TIMESTAMP: this repo FUTURE-dates migrations, so a real-clock
-- `date -u` name would sort BEFORE the existing files and could be overridden by
-- them. 20261201000000 is deliberately placed after the newest LOCAL file
-- (20261126000000_agency_domains_anon_column_scope.sql) and after the newest
-- versions already present in the REMOTE ledger at time of writing
-- (20261128000000 / 20261130000000, in flight from sibling branches).

BEGIN;

ALTER TABLE public.agency_entitlements
  ALTER COLUMN reviews_enabled SET DEFAULT TRUE;

UPDATE public.agency_entitlements
   SET reviews_enabled = TRUE
 WHERE reviews_enabled IS DISTINCT FROM TRUE;

COMMENT ON COLUMN public.agency_entitlements.reviews_enabled IS
  'Review surfaces (profile reviews + testimonials, card standing, talent Reviews page, client Reviews area) for this SURFACE tenant. Platform default is TRUE as of 20261201000000 — collecting reviews is free on every tier because reviews are marketplace trust data. Platform-write only; staff may still set a specific tenant FALSE.';

COMMIT;
