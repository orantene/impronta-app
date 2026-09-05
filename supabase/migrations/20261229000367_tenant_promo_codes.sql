-- Phase 2 · E6 — tenant-owned promo codes. Early bird, comps, a performer's code.
--
-- The platform already has a discount store: `product_discounts`, for SaaS
-- coupons on Tulala's own plans. This is not that, and it must not become a
-- third one -- the repo has already killed two rival discount stores.
--
-- TWO THINGS FROM THAT TABLE ARE DELIBERATELY NOT COPIED, and each would be a
-- real defect here rather than a style difference.
--
-- 1. `product_discounts.code` is `text NOT NULL UNIQUE` -- GLOBALLY unique.
--    Correct for a platform coupon; catastrophic for a tenant one, because the
--    first venue to create SALSA10 takes it from every other venue on the
--    platform, and the failure surfaces as an unexplained "code already exists"
--    in a stranger's workspace. Here it is unique per (tenant, code), case
--    insensitively, because a venue that types salsa10 means SALSA10.
--
-- 2. `product_discounts.redemption_count` is an int nobody locks. Two checkouts
--    on the last comp both read 19 and both write 20, and the twenty-first guest
--    is on the list. Redemptions here are ROWS, counted, with a unique index per
--    order. The count cannot drift from the thing it counts because it IS the
--    thing it counts.

BEGIN;

CREATE TABLE IF NOT EXISTS public.tenant_promo_codes (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,

  code               text NOT NULL CHECK (char_length(code) BETWEEN 2 AND 40),
  label              text,

  kind               text NOT NULL CHECK (kind IN ('percent','fixed')),
  -- ONE COLUMN, TWO UNITS, AND A CHECK THAT SAYS SO. `value` is a percentage
  -- 1..100 when kind='percent' and INTEGER CENTS when kind='fixed'. A numeric
  -- percent and a money amount sharing an unconstrained column is how a 10%
  -- discount becomes ten cents, so the constraint is not optional decoration.
  value              bigint NOT NULL CHECK (value > 0),
  CONSTRAINT promo_percent_range CHECK (kind <> 'percent' OR value BETWEEN 1 AND 100),
  currency           text CHECK (currency IS NULL OR char_length(currency) = 3),
  CONSTRAINT promo_fixed_currency CHECK (kind <> 'fixed' OR currency IS NOT NULL),

  -- Scope, narrowing. NULL event = the whole workspace; NULL variant = every
  -- tier of that event. A variant without its event is not meaningful, so it is
  -- refused rather than silently treated as workspace-wide.
  event_id           uuid REFERENCES public.events(id) ON DELETE CASCADE,
  variant_id         uuid REFERENCES public.talent_offering_variants(id) ON DELETE CASCADE,
  CONSTRAINT promo_variant_needs_event CHECK (variant_id IS NULL OR event_id IS NOT NULL),

  max_redemptions    int CHECK (max_redemptions IS NULL OR max_redemptions > 0),
  per_customer_limit int NOT NULL DEFAULT 1 CHECK (per_customer_limit > 0),
  starts_at          timestamptz,
  ends_at            timestamptz,
  CONSTRAINT promo_window CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at),

  is_active          boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- Per tenant, case-insensitive. NOT globally unique. See the header.
CREATE UNIQUE INDEX IF NOT EXISTS tenant_promo_codes_uniq
  ON public.tenant_promo_codes (tenant_id, upper(code));
CREATE INDEX IF NOT EXISTS tenant_promo_codes_event_idx
  ON public.tenant_promo_codes (event_id) WHERE event_id IS NOT NULL;

-- ── Redemptions are rows, never a counter ──────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tenant_promo_redemptions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_code_id  uuid NOT NULL REFERENCES public.tenant_promo_codes(id) ON DELETE CASCADE,
  order_id       uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  customer_id    uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  amount_cents   bigint NOT NULL CHECK (amount_cents >= 0),
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- One code per order. Stacking is a product decision nobody has made, and the
-- absence of this index is how it would get made by accident.
CREATE UNIQUE INDEX IF NOT EXISTS tenant_promo_redemption_per_order
  ON public.tenant_promo_redemptions (order_id);
CREATE INDEX IF NOT EXISTS tenant_promo_redemption_code_idx
  ON public.tenant_promo_redemptions (promo_code_id);
-- The per-customer limit is counted off this index, not off a column.
CREATE INDEX IF NOT EXISTS tenant_promo_redemption_customer_idx
  ON public.tenant_promo_redemptions (promo_code_id, customer_id)
  WHERE customer_id IS NOT NULL;

-- ── RLS ────────────────────────────────────────────────────────────────────
--
-- NO ANON READ, deliberately, and this is the one place it is tempting. The
-- public ticket picker never needs to LIST codes -- a code is typed, then
-- validated server-side. An anon-readable table of active codes is a page
-- anyone can scrape for every discount a venue runs, including the ones scoped
-- to one performer's link.

ALTER TABLE public.tenant_promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_promo_redemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_promo_codes_select_staff ON public.tenant_promo_codes;
CREATE POLICY tenant_promo_codes_select_staff ON public.tenant_promo_codes
  FOR SELECT TO authenticated USING (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS tenant_promo_redemptions_select_staff ON public.tenant_promo_redemptions;
CREATE POLICY tenant_promo_redemptions_select_staff ON public.tenant_promo_redemptions
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.tenant_promo_codes c
             WHERE c.id = promo_code_id AND public.is_staff_of_tenant(c.tenant_id))
  );

REVOKE ALL ON TABLE public.tenant_promo_codes       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.tenant_promo_redemptions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.tenant_promo_codes       TO authenticated;
GRANT SELECT ON TABLE public.tenant_promo_redemptions TO authenticated;

CREATE OR REPLACE FUNCTION public.tenant_promo_codes_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS tenant_promo_codes_touch_trg ON public.tenant_promo_codes;
CREATE TRIGGER tenant_promo_codes_touch_trg
  BEFORE UPDATE ON public.tenant_promo_codes
  FOR EACH ROW EXECUTE FUNCTION public.tenant_promo_codes_touch();

COMMENT ON TABLE public.tenant_promo_codes IS
  'Tenant-owned discount codes: early bird, comps, a performer''s tracked code. NOT product_discounts, '
  'which is the platform SaaS coupon store. Unique per (tenant, upper(code)) -- never globally, or the '
  'first venue to claim SALSA10 takes it from every other venue.';
COMMENT ON TABLE public.tenant_promo_redemptions IS
  'One row per redemption, and the ONLY count of them. product_discounts keeps an unlocked int; two '
  'checkouts on the last comp both read 19 and both write 20. A count that IS the rows cannot drift '
  'from what it counts.';
COMMENT ON COLUMN public.tenant_promo_codes.value IS
  'A percentage 1..100 when kind=percent, INTEGER CENTS when kind=fixed. One column, two units, and a '
  'CHECK per kind that says which -- an unconstrained shared column is how 10% becomes ten cents.';

COMMIT;
