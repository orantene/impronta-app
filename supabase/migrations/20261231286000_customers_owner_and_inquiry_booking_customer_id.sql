-- B2 / Phase 1.3 — customer_id on inquiries + agency_bookings;
-- talent-owned customers (owner_talent_profile_id) + RLS;
-- silent reuse only on exact email of the SAME owner (and tenant).
--
-- Locked: DECISIONS.md #3. Must sort after 20261231284000_services_rebuild.sql
-- and after remote 20261231285000_customers_notes_column_privilege.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Owner column on customers
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS owner_talent_profile_id UUID
    REFERENCES public.talent_profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.customers.owner_talent_profile_id IS
  'NULL = agency/tenant-owned client pool. Set = talent-private client on that '
  'tenant (typically the hub). Silent email reuse is scoped to the same owner.';

CREATE INDEX IF NOT EXISTS customers_tenant_owner_idx
  ON public.customers (tenant_id, owner_talent_profile_id)
  WHERE owner_talent_profile_id IS NOT NULL AND merged_into_id IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Unique identity indexes — split agency pool vs talent-owned pool
-- ─────────────────────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS public.customers_tenant_email_key;
DROP INDEX IF EXISTS public.customers_tenant_phone_only_key;

-- Agency / tenant pool (owner IS NULL): one email per tenant.
CREATE UNIQUE INDEX customers_tenant_email_agency_key
  ON public.customers (tenant_id, email)
  WHERE email IS NOT NULL
    AND owner_talent_profile_id IS NULL
    AND merged_into_id IS NULL;

-- Talent-owned pool: one email per (tenant, owner).
CREATE UNIQUE INDEX customers_tenant_email_owner_key
  ON public.customers (tenant_id, owner_talent_profile_id, email)
  WHERE email IS NOT NULL
    AND owner_talent_profile_id IS NOT NULL
    AND merged_into_id IS NULL;

-- Phone identifies ONLY when email is absent — still scoped by owner.
CREATE UNIQUE INDEX customers_tenant_phone_only_agency_key
  ON public.customers (tenant_id, phone_e164)
  WHERE phone_e164 IS NOT NULL
    AND email IS NULL
    AND owner_talent_profile_id IS NULL
    AND merged_into_id IS NULL;

CREATE UNIQUE INDEX customers_tenant_phone_only_owner_key
  ON public.customers (tenant_id, owner_talent_profile_id, phone_e164)
  WHERE phone_e164 IS NOT NULL
    AND email IS NULL
    AND owner_talent_profile_id IS NOT NULL
    AND merged_into_id IS NULL;

COMMENT ON INDEX public.customers_tenant_email_agency_key IS
  'Agency-owned customers: unique (tenant, email) when owner is null.';
COMMENT ON INDEX public.customers_tenant_email_owner_key IS
  'Talent-owned customers: unique (tenant, owner, email). Two talents on the '
  'hub may each own a client with the same email.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. customer_id on inquiries + agency_bookings
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.inquiries
  ADD COLUMN IF NOT EXISTS customer_id UUID
    REFERENCES public.customers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS inquiries_tenant_customer_idx
  ON public.inquiries (tenant_id, customer_id)
  WHERE customer_id IS NOT NULL;

ALTER TABLE public.agency_bookings
  ADD COLUMN IF NOT EXISTS customer_id UUID
    REFERENCES public.customers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS agency_bookings_tenant_customer_idx
  ON public.agency_bookings (tenant_id, customer_id)
  WHERE customer_id IS NOT NULL;

COMMENT ON COLUMN public.inquiries.customer_id IS
  'Denormalized link to customers. Set at intake via ensureCustomer.';
COMMENT ON COLUMN public.agency_bookings.customer_id IS
  'Denormalized link to customers. Set at booking creation / convert.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RLS — agency staff see agency-owned only; talent sees own owned rows
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS customers_staff_select ON public.customers;
CREATE POLICY customers_staff_select ON public.customers
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR (
      public.is_staff_of_tenant(tenant_id)
      AND owner_talent_profile_id IS NULL
    )
  );

DROP POLICY IF EXISTS customers_owner_talent_select ON public.customers;
CREATE POLICY customers_owner_talent_select ON public.customers
  FOR SELECT TO authenticated
  USING (
    owner_talent_profile_id IS NOT NULL
    AND EXISTS (
      SELECT 1
        FROM public.talent_profiles tp
       WHERE tp.id = owner_talent_profile_id
         AND tp.user_id = (SELECT auth.uid())
    )
  );

-- customers_self_select (user_id = auth.uid()) unchanged from 00140.

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. ensure_customer_for_tenant — optional owner scope
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.ensure_customer_for_tenant(UUID, TEXT, TEXT, TEXT, UUID);

CREATE OR REPLACE FUNCTION public.ensure_customer_for_tenant(
  p_tenant_id                 UUID,
  p_email                     TEXT,
  p_phone                     TEXT DEFAULT NULL,
  p_display_name              TEXT DEFAULT NULL,
  p_user_id                   UUID DEFAULT NULL,
  p_owner_talent_profile_id   UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_email  public.citext;
  v_phone  TEXT;
  v_name   TEXT;
  v_id     UUID;
BEGIN
  v_email := NULLIF(lower(trim(COALESCE(p_email, ''))), '')::public.citext;
  v_phone := CASE
               WHEN COALESCE(p_phone, '') ~ '^\+[1-9][0-9]{6,14}$' THEN trim(p_phone)
               ELSE NULL
             END;
  v_name  := NULLIF(trim(COALESCE(p_display_name, '')), '');

  IF v_email IS NULL AND v_phone IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_email IS NOT NULL THEN
    IF p_owner_talent_profile_id IS NULL THEN
      SELECT id INTO v_id FROM public.customers
       WHERE tenant_id = p_tenant_id
         AND email = v_email
         AND owner_talent_profile_id IS NULL
         AND merged_into_id IS NULL
       LIMIT 1;
    ELSE
      SELECT id INTO v_id FROM public.customers
       WHERE tenant_id = p_tenant_id
         AND email = v_email
         AND owner_talent_profile_id = p_owner_talent_profile_id
         AND merged_into_id IS NULL
       LIMIT 1;
    END IF;
  ELSE
    IF p_owner_talent_profile_id IS NULL THEN
      SELECT id INTO v_id FROM public.customers
       WHERE tenant_id = p_tenant_id
         AND phone_e164 = v_phone
         AND email IS NULL
         AND owner_talent_profile_id IS NULL
         AND merged_into_id IS NULL
       LIMIT 1;
    ELSE
      SELECT id INTO v_id FROM public.customers
       WHERE tenant_id = p_tenant_id
         AND phone_e164 = v_phone
         AND email IS NULL
         AND owner_talent_profile_id = p_owner_talent_profile_id
         AND merged_into_id IS NULL
       LIMIT 1;
    END IF;
  END IF;

  IF v_id IS NOT NULL THEN
    UPDATE public.customers
       SET phone_e164   = COALESCE(phone_e164, v_phone),
           display_name = COALESCE(display_name, v_name),
           user_id      = COALESCE(user_id, p_user_id)
     WHERE id = v_id;
    RETURN v_id;
  END IF;

  INSERT INTO public.customers (
    tenant_id, email, phone_e164, display_name, user_id, owner_talent_profile_id
  ) VALUES (
    p_tenant_id, v_email, v_phone, v_name, p_user_id, p_owner_talent_profile_id
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    IF v_email IS NOT NULL THEN
      IF p_owner_talent_profile_id IS NULL THEN
        SELECT id INTO v_id FROM public.customers
         WHERE tenant_id = p_tenant_id AND email = v_email
           AND owner_talent_profile_id IS NULL AND merged_into_id IS NULL
         LIMIT 1;
      ELSE
        SELECT id INTO v_id FROM public.customers
         WHERE tenant_id = p_tenant_id AND email = v_email
           AND owner_talent_profile_id = p_owner_talent_profile_id
           AND merged_into_id IS NULL
         LIMIT 1;
      END IF;
    ELSE
      IF p_owner_talent_profile_id IS NULL THEN
        SELECT id INTO v_id FROM public.customers
         WHERE tenant_id = p_tenant_id AND phone_e164 = v_phone
           AND email IS NULL AND owner_talent_profile_id IS NULL
           AND merged_into_id IS NULL
         LIMIT 1;
      ELSE
        SELECT id INTO v_id FROM public.customers
         WHERE tenant_id = p_tenant_id AND phone_e164 = v_phone
           AND email IS NULL
           AND owner_talent_profile_id = p_owner_talent_profile_id
           AND merged_into_id IS NULL
         LIMIT 1;
      END IF;
    END IF;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_customer_for_tenant(UUID, TEXT, TEXT, TEXT, UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ensure_customer_for_tenant(UUID, TEXT, TEXT, TEXT, UUID, UUID)
  FROM anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. bookings_write_order — prefer inquiry.customer_id; stamp booking.customer_id
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.bookings_write_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  inq        RECORD;
  v_offer_id UUID;
  v_currency TEXT;
  v_customer UUID;
  v_order_id UUID;
  v_subtotal BIGINT;
  v_owner    UUID;
BEGIN
  IF NEW.order_id IS NOT NULL OR NEW.source_inquiry_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO inq FROM public.inquiries WHERE id = NEW.source_inquiry_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT io.id, io.currency_code INTO v_offer_id, v_currency
    FROM public.inquiry_offers io
   WHERE io.inquiry_id = NEW.source_inquiry_id
     AND io.status = 'accepted'
   ORDER BY io.accepted_at DESC NULLS LAST, io.created_at DESC
   LIMIT 1;

  IF v_offer_id IS NULL THEN RETURN NULL; END IF;

  -- Prefer the intake-linked customer; else ensure in the agency pool
  -- (owner null). Talent-owned ensure happens in app writers that know the
  -- seller. Single talent-direct participant is a best-effort SQL hint.
  v_customer := COALESCE(NEW.customer_id, inq.customer_id);

  IF v_customer IS NULL THEN
    SELECT ip.talent_profile_id INTO v_owner
      FROM public.inquiry_participants ip
     WHERE ip.inquiry_id = NEW.source_inquiry_id
       AND ip.role = 'talent'
       AND ip.owning_party_type = 'talent'
     ORDER BY ip.sort_order ASC NULLS LAST
     LIMIT 1;
    -- Only treat as talent-owned when exactly one such talent participant.
    IF (
      SELECT count(*) FROM public.inquiry_participants ip2
       WHERE ip2.inquiry_id = NEW.source_inquiry_id
         AND ip2.role = 'talent'
         AND ip2.owning_party_type = 'talent'
    ) <> 1 THEN
      v_owner := NULL;
    END IF;

    v_customer := public.ensure_customer_for_tenant(
      COALESCE(NEW.tenant_id_snapshot, inq.tenant_id),
      COALESCE(NEW.contact_email, inq.contact_email),
      COALESCE(NEW.contact_phone, inq.contact_phone),
      COALESCE(NEW.contact_name,  inq.contact_name),
      COALESCE(NEW.client_user_id, inq.client_user_id),
      v_owner
    );
  END IF;

  IF v_customer IS NULL THEN RETURN NULL; END IF;

  SELECT COALESCE(SUM(public.offer_major_to_cents(li.total_price)), 0)
    INTO v_subtotal
    FROM public.inquiry_offer_line_items li
   WHERE li.offer_id = v_offer_id;

  INSERT INTO public.orders (
    tenant_id, customer_id, inquiry_id, status, currency,
    subtotal_cents, discount_cents, tax_cents, total_cents,
    source_channel, payout_release_rule, created_by
  ) VALUES (
    COALESCE(NEW.tenant_id_snapshot, inq.tenant_id),
    v_customer,
    NEW.source_inquiry_id,
    'pending_payment',
    COALESCE(v_currency, NEW.currency_code, 'USD'),
    v_subtotal, 0, 0, v_subtotal,
    'offer',
    'immediate',
    NEW.created_by_staff_id
  ) RETURNING id INTO v_order_id;

  INSERT INTO public.order_lines (
    order_id, tenant_id, offering_id, label, units, unit_cents, total_cents,
    talent_profile_id, owner_tenant_id, talent_cost_cents, sort_order
  )
  SELECT
    v_order_id,
    COALESCE(NEW.tenant_id_snapshot, inq.tenant_id),
    li.source_service_id,
    COALESCE(NULLIF(trim(li.label), ''), 'Line'),
    GREATEST(COALESCE(li.units, 1), 0.001),
    public.offer_major_to_cents(li.unit_price),
    public.offer_major_to_cents(li.total_price),
    li.talent_profile_id,
    CASE WHEN li.talent_profile_id IS NULL
         THEN COALESCE(li.owner_tenant_id, NEW.tenant_id_snapshot, inq.tenant_id)
         ELSE NULL END,
    public.offer_major_to_cents(li.talent_cost),
    COALESCE(li.sort_order, 0)
  FROM public.inquiry_offer_line_items li
  WHERE li.offer_id = v_offer_id;

  UPDATE public.agency_bookings
     SET order_id = v_order_id,
         customer_id = COALESCE(customer_id, v_customer)
   WHERE id = NEW.id;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.bookings_write_order() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.bookings_write_order() FROM anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Verify
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'customers'
       AND column_name = 'owner_talent_profile_id'
  ) THEN
    RAISE EXCEPTION 'B2: customers.owner_talent_profile_id missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'inquiries'
       AND column_name = 'customer_id'
  ) THEN
    RAISE EXCEPTION 'B2: inquiries.customer_id missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'agency_bookings'
       AND column_name = 'customer_id'
  ) THEN
    RAISE EXCEPTION 'B2: agency_bookings.customer_id missing';
  END IF;

  IF to_regclass('public.customers_tenant_email_agency_key') IS NULL
     OR to_regclass('public.customers_tenant_email_owner_key') IS NULL THEN
    RAISE EXCEPTION 'B2: email unique indexes missing';
  END IF;

  IF has_table_privilege('anon', 'public.customers', 'SELECT')
     OR has_table_privilege('authenticated', 'public.customers', 'INSERT')
  THEN
    RAISE EXCEPTION 'B2: customers grants regressed';
  END IF;
END $$;

COMMIT;
