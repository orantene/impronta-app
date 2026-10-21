-- TUL-1601 · Automatic monthly rent: a Stripe Subscription on the platform account, money transferred to the studio
-- (transfer_data). HELD in _pending_pm. Additive only; a NEW migration because 20261231420700 is already on staging.
--
-- One live subscription per plan; each paid or failed Stripe invoice lands on the (plan, month) row once, keyed by its
-- Stripe invoice id. Months before `autopay_first_period` stay on payment links.
--
-- ROLLBACK:
--   DROP INDEX IF EXISTS public.studio_rent_invoices_stripe_invoice_uniq;
--   DROP INDEX IF EXISTS public.studio_rent_plans_subscription_uniq;
--   ALTER TABLE public.studio_rent_invoices DROP COLUMN IF EXISTS source, DROP COLUMN IF EXISTS stripe_invoice_id;
--   ALTER TABLE public.studio_rent_plans DROP COLUMN IF EXISTS autopay_status, DROP COLUMN IF EXISTS stripe_subscription_id, DROP COLUMN IF EXISTS autopay_first_period;

BEGIN;

ALTER TABLE public.studio_rent_plans
  ADD COLUMN IF NOT EXISTS autopay_status text NOT NULL DEFAULT 'off'
    CHECK (autopay_status IN ('off','pending','active','paused','past_due','canceled')),
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text NULL,
  -- The first month the subscription charges (the month after it was started).
  ADD COLUMN IF NOT EXISTS autopay_first_period text NULL
    CHECK (autopay_first_period IS NULL OR autopay_first_period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
CREATE UNIQUE INDEX IF NOT EXISTS studio_rent_plans_subscription_uniq
  ON public.studio_rent_plans (stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;

ALTER TABLE public.studio_rent_invoices
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'link' CHECK (source IN ('link','autopay')),
  ADD COLUMN IF NOT EXISTS stripe_invoice_id text NULL;
CREATE UNIQUE INDEX IF NOT EXISTS studio_rent_invoices_stripe_invoice_uniq
  ON public.studio_rent_invoices (stripe_invoice_id) WHERE stripe_invoice_id IS NOT NULL;

COMMIT;
