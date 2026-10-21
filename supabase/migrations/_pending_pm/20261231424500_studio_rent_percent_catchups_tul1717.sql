-- TUL-1717 · Collecting a month's percentage of sales that the automatic invoice could not carry (finalized too early, or
-- the percentage switch was off), through the ordinary payment-link path. HELD in _pending_pm. Additive.
-- Why its own table: studio_rent_invoices has one row per (plan, month) and that row is taken by the month's fixed rent
-- (paid automatically). A percentage-only invoice needs its own key: (plan, SALES month). Depends on 20261231423010 (TUL-1466)
-- and 20261231423210 (TUL-1701, autopay_percent_missed).
--
-- ROLLBACK (nothing may reference it): DROP TABLE IF EXISTS public.studio_rent_percent_catchups;

BEGIN;

CREATE TABLE IF NOT EXISTS public.studio_rent_percent_catchups (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id             uuid        NOT NULL REFERENCES public.studio_rent_plans(id) ON DELETE CASCADE,
  tenant_id           uuid        NOT NULL REFERENCES public.agencies(id)          ON DELETE CASCADE,
  talent_profile_id   uuid        NOT NULL REFERENCES public.talent_profiles(id)   ON DELETE CASCADE,
  -- The month whose SALES the percentage is a share of (the month the automatic invoice failed to bill).
  sales_month         text        NOT NULL CHECK (sales_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  amount_cents        integer     NOT NULL CHECK (amount_cents > 0),
  currency            text        NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  order_id            uuid        NULL,
  payment_link_code   text        NULL,
  status              text        NOT NULL DEFAULT 'issuing' CHECK (status IN ('issuing','issued','paid','void')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  issued_at           timestamptz NULL,
  paid_at             timestamptz NULL,
  -- The idempotency anchor: a second click, a retry or a replay lands on the same row, so a month is billed once.
  CONSTRAINT studio_rent_percent_catchups_one_per_month UNIQUE (plan_id, sales_month)
);

CREATE INDEX IF NOT EXISTS studio_rent_percent_catchups_tenant_idx
  ON public.studio_rent_percent_catchups (tenant_id, sales_month DESC);

ALTER TABLE public.studio_rent_percent_catchups ENABLE ROW LEVEL SECURITY;

-- Read: the studio's staff, the member, platform admins. Writes are service-role only.
DROP POLICY IF EXISTS studio_rent_percent_catchups_read ON public.studio_rent_percent_catchups;
CREATE POLICY studio_rent_percent_catchups_read ON public.studio_rent_percent_catchups
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR public.is_staff_of_tenant(tenant_id)
    OR public.is_own_talent_profile(talent_profile_id)
  );

REVOKE ALL ON public.studio_rent_percent_catchups FROM anon;

COMMIT;
