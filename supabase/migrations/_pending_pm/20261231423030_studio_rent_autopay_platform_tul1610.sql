-- TUL-1610 · Rent autopay on the studio's own Stripe platform (US or MX). HELD in _pending_pm. Additive only.
-- A NEW migration: 20261231420700 is already on staging. Depends on 20261231423000 (TUL-1601).
-- The subscription and the member's Stripe customer live on the studio's platform; both are remembered on the plan
-- so cancel, pause/resume and the webhook act on the right platform.
--
-- ROLLBACK: ALTER TABLE public.studio_rent_plans DROP COLUMN IF EXISTS autopay_platform, DROP COLUMN IF EXISTS autopay_customer_id;

BEGIN;

ALTER TABLE public.studio_rent_plans
  ADD COLUMN IF NOT EXISTS autopay_platform text NULL CHECK (autopay_platform IS NULL OR autopay_platform IN ('us','mx')),
  ADD COLUMN IF NOT EXISTS autopay_customer_id text NULL;

COMMIT;
