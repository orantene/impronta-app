-- SaaS billing scaffold — agencies.plan_tier + agencies.talent_seat_limit.
--
-- Phase 1 (P1.A.1) shipped agencies without billing fields; the admin shell
-- has been faking the plan via a `?plan=` URL param. This migration moves
-- the plan to the source of truth so:
--   • the dashboard reads the same value everywhere (tier-chip, billing
--     panels, capability catalog),
--   • a downgrade/upgrade is a real DB write (one row update), and
--   • locked capability cards reflect what the workspace actually pays for
--     instead of what the URL says.
--
-- Stripe and seat enforcement land in a later phase; this migration is the
-- minimum so the UI is honest. `talent_seat_limit` is nullable to model
-- "unlimited" (Network) without a sentinel like 999_999.
--
-- Additive only (L18). No RLS changes.

BEGIN;

ALTER TABLE public.agencies
  ADD COLUMN IF NOT EXISTS plan_tier TEXT NOT NULL DEFAULT 'free'
    CHECK (plan_tier IN ('free','studio','agency','network'));

ALTER TABLE public.agencies
  ADD COLUMN IF NOT EXISTS talent_seat_limit INTEGER NULL
    CHECK (talent_seat_limit IS NULL OR talent_seat_limit > 0);

COMMENT ON COLUMN public.agencies.plan_tier IS
  'Subscription tier driving capability gates in /admin/site and the upgrade modal. One of free | studio | agency | network. Source of truth for the admin shell tier-chip and AccountBillingPanels.';

COMMENT ON COLUMN public.agencies.talent_seat_limit IS
  'Talent roster cap for this tenant. NULL = unlimited (Network). Phase-1 defaults follow the public pricing page: free=10, studio=50, agency=200, network=NULL.';

-- Backfill defaults aligned with the public pricing page so existing tenants
-- don't all show "0 / 10" the moment this lands. plan_tier already defaults
-- to 'free' on the column; the seat limit needs an explicit backfill since
-- it has no DEFAULT.
UPDATE public.agencies
   SET talent_seat_limit = CASE plan_tier
     WHEN 'free'    THEN 10
     WHEN 'studio'  THEN 50
     WHEN 'agency'  THEN 200
     WHEN 'network' THEN NULL
   END
 WHERE talent_seat_limit IS NULL
   AND plan_tier <> 'network';

COMMIT;
