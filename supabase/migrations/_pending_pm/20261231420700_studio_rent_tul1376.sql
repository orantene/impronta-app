-- TUL-1376 · Service hub: rental studios (monthly rent billed through Tulala).
--
-- HELD in _pending_pm. Additive only: two new tables, no existing object changes. While this
-- file is not applied the app answers "unavailable" and bills nothing (flag RENT_BILLING_ENABLED
-- is also OFF by default and refuses any live Stripe key).
--
-- Model: a studio proposes a monthly rent to one member (talent); the member accepts before any
-- invoice can be issued (consent to be charged). One invoice per (plan, month), issued by hand
-- by the studio. The invoice points at an ordinary order + payment link, so fee, payout, refund
-- and dispute handling are the existing rails; this file adds no money columns beyond the rent.
--
-- ROLLBACK (nothing else depends on these):
--   DROP TABLE IF EXISTS public.studio_rent_invoices;
--   DROP TABLE IF EXISTS public.studio_rent_plans;

BEGIN;

CREATE TABLE IF NOT EXISTS public.studio_rent_plans (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid        NOT NULL REFERENCES public.agencies(id)        ON DELETE CASCADE,
  talent_profile_id   uuid        NOT NULL REFERENCES public.talent_profiles(id) ON DELETE CASCADE,
  monthly_rent_cents  integer     NOT NULL CHECK (monthly_rent_cents > 0 AND monthly_rent_cents <= 100000000),
  currency            text        NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  starts_on           date        NOT NULL,
  -- The station (resource) held with each of the member's bookings. Linked through the resource
  -- engine (TUL-1375); null until the studio picks one.
  station_resource_id uuid        NULL,
  status              text        NOT NULL DEFAULT 'proposed'
                                    CHECK (status IN ('proposed','active','paused','ended','declined')),
  proposed_by         uuid        NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  proposed_at         timestamptz NOT NULL DEFAULT now(),
  accepted_at         timestamptz NULL,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  -- 'active' and 'paused' mean the member said yes.
  CONSTRAINT studio_rent_plans_accepted CHECK (status NOT IN ('active','paused') OR accepted_at IS NOT NULL)
);

-- One live plan (proposed, active or paused) per studio and member.
CREATE UNIQUE INDEX IF NOT EXISTS studio_rent_plans_one_live
  ON public.studio_rent_plans (tenant_id, talent_profile_id)
  WHERE status IN ('proposed','active','paused');

CREATE INDEX IF NOT EXISTS studio_rent_plans_talent_idx
  ON public.studio_rent_plans (talent_profile_id, status);

CREATE TABLE IF NOT EXISTS public.studio_rent_invoices (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id             uuid        NOT NULL REFERENCES public.studio_rent_plans(id) ON DELETE CASCADE,
  tenant_id           uuid        NOT NULL REFERENCES public.agencies(id)        ON DELETE CASCADE,
  talent_profile_id   uuid        NOT NULL REFERENCES public.talent_profiles(id) ON DELETE CASCADE,
  period              text        NOT NULL CHECK (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  -- Frozen at issue: a later change to the plan never rewrites an invoice already made.
  amount_cents        integer     NOT NULL CHECK (amount_cents > 0),
  currency            text        NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  order_id            uuid        NULL,
  payment_link_code   text        NULL,
  status              text        NOT NULL DEFAULT 'issuing'
                                    CHECK (status IN ('issuing','issued','paid','failed','void')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  issued_at           timestamptz NULL,
  paid_at             timestamptz NULL,
  -- The idempotency anchor: a second click, a retry or a replay lands on the same row.
  CONSTRAINT studio_rent_invoices_one_per_month UNIQUE (plan_id, period)
);

CREATE INDEX IF NOT EXISTS studio_rent_invoices_tenant_idx
  ON public.studio_rent_invoices (tenant_id, period DESC);

ALTER TABLE public.studio_rent_plans    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.studio_rent_invoices ENABLE ROW LEVEL SECURITY;

-- Read: the studio's staff, the member, platform admins. Writes are service-role only.
DROP POLICY IF EXISTS studio_rent_plans_read ON public.studio_rent_plans;
CREATE POLICY studio_rent_plans_read ON public.studio_rent_plans
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR public.is_staff_of_tenant(tenant_id)
    OR public.is_own_talent_profile(talent_profile_id)
  );

DROP POLICY IF EXISTS studio_rent_invoices_read ON public.studio_rent_invoices;
CREATE POLICY studio_rent_invoices_read ON public.studio_rent_invoices
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR public.is_staff_of_tenant(tenant_id)
    OR public.is_own_talent_profile(talent_profile_id)
  );

REVOKE ALL ON public.studio_rent_plans    FROM anon;
REVOKE ALL ON public.studio_rent_invoices FROM anon;

COMMIT;
