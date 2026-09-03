-- Phase 0.5, correction — two references made real.
--
-- Both changes came from the Platform Features Director challenging the plan,
-- and both are cases of removing a problem rather than accommodating it.
--
-- ── 1. `order_lines.allocation_ids uuid[]` is DROPPED. ───────────────────────
--
-- The array existed so Orders would not have to wait for the Capacity Engine.
-- That reason has expired: Capacity 0.2 is applied, and it already ships
-- `capacity_allocations.order_line_id` (nullable, indexed, no FK because
-- order_lines did not exist yet).
--
-- The Director proposed a join table, `order_line_allocations`. That is right
-- about the substance and heavier than needed: one line holds MANY allocations
-- and an allocation belongs to exactly ONE line, so this is one-to-many. The
-- link belongs on the many side. A join table is for many-to-many, which cannot
-- happen here — two order lines sharing one allocation would mean two customers
-- holding the same seat.
--
-- Keeping BOTH the array and Capacity's column would be the worst option: two
-- sources of truth for the same fact, free to disagree, with nothing to detect
-- the disagreement.
--
-- The Director's real requirements are met by this shape:
--   • referential integrity — a real FK, added below;
--   • refund by line — `WHERE order_line_id = $1` on an existing index, not an
--     array scan. Refunding a line finds exactly its allocations.
--   • layering — Capacity still never calls Orders. The column points at us; the
--     dependency is a nullable FK, which is why they could ship it before we
--     existed.
--
-- Nothing is lost: `order_lines` has 0 rows, so the array has never been read.
--
-- ON DELETE SET NULL, as the Capacity Engine Manager specified: deleting an
-- order line must never silently destroy the record of units it was holding.
--
-- ── 2. `inquiry_offer_line_items.source_service_id` becomes a real uuid FK. ──
--
-- It was TEXT by accident of 20260614223027, and 20261228000143 accommodated
-- that with a cast-and-drop in the convert trigger plus a "dropped" NOTICE.
--
-- Measured instead of assumed: the table has ZERO rows in production, every
-- writer stamps an offering id (offerings-offer.ts:67 `o.id`,
-- menu-order-offer.ts:62 `item.offeringId`, inquiry-engine-offers.ts:910 passes
-- the stamp through), and 156 offerings exist. So the tolerance was for data
-- that has never existed, and a drop-rate metric on a rate that reads zero
-- forever tells nobody anything.
--
-- With zero rows this is a no-backfill retype. The residual risk — a future
-- writer passing a non-offering string — is exactly what a foreign key catches,
-- loudly at write time, instead of silently at conversion time.
--
-- This repo has a recorded lesson named "copying the sibling pattern preserved
-- the bug". Downstream tolerance for a broken upstream reference is that shape.

BEGIN;

-- ── 1 ────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF (SELECT count(*) FROM public.order_lines) <> 0 THEN
    RAISE EXCEPTION 'order_lines is no longer empty — allocation_ids may hold real references; migrate them before dropping';
  END IF;
END $$;

ALTER TABLE public.order_lines DROP COLUMN IF EXISTS allocation_ids;

ALTER TABLE public.capacity_allocations
  DROP CONSTRAINT IF EXISTS capacity_allocations_order_line_id_fkey;
ALTER TABLE public.capacity_allocations
  ADD CONSTRAINT capacity_allocations_order_line_id_fkey
  FOREIGN KEY (order_line_id) REFERENCES public.order_lines(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.capacity_allocations.order_line_id IS
  'The order line holding these units. THE single link between an order and its capacity — '
  'order_lines carries no array. Refund-by-line releases exactly WHERE order_line_id = $1.';

-- ── 2 ────────────────────────────────────────────────────────────────────────
DO $$
DECLARE v_rows INT;
BEGIN
  SELECT count(*) INTO v_rows FROM public.inquiry_offer_line_items;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION
      'inquiry_offer_line_items has % row(s) — the no-backfill retype of source_service_id is only safe at zero; write a backfill first',
      v_rows;
  END IF;
END $$;

ALTER TABLE public.inquiry_offer_line_items
  ALTER COLUMN source_service_id TYPE uuid USING NULLIF(source_service_id, '')::uuid;

ALTER TABLE public.inquiry_offer_line_items
  DROP CONSTRAINT IF EXISTS inquiry_offer_line_items_source_service_id_fkey;
ALTER TABLE public.inquiry_offer_line_items
  ADD CONSTRAINT inquiry_offer_line_items_source_service_id_fkey
  FOREIGN KEY (source_service_id) REFERENCES public.talent_offerings(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.inquiry_offer_line_items.source_service_id IS
  'The offering this line was built from. uuid + FK since 20261228000144; it was TEXT by accident '
  'of 20260614223027 and every writer always stamped an offering id.';

-- ── 3. The convert trigger no longer needs to be tolerant. ───────────────────
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

  v_customer := public.ensure_customer_for_tenant(
    COALESCE(NEW.tenant_id_snapshot, inq.tenant_id),
    COALESCE(NEW.contact_email, inq.contact_email),
    COALESCE(NEW.contact_phone, inq.contact_phone),
    COALESCE(NEW.contact_name,  inq.contact_name),
    COALESCE(NEW.client_user_id, inq.client_user_id)
  );

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

  -- `source_service_id` is a uuid FK now, so it either names a live offering or
  -- is null. No cast, no drop, no drop-rate log for a rate that reads zero.
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

  UPDATE public.agency_bookings SET order_id = v_order_id WHERE id = NEW.id;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.bookings_write_order() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.bookings_write_order() FROM anon, authenticated;

-- ── Verify ───────────────────────────────────────────────────────────────────
DO $$
BEGIN
  PERFORM 1 FROM information_schema.columns
   WHERE table_schema='public' AND table_name='order_lines' AND column_name='allocation_ids';
  IF FOUND THEN RAISE EXCEPTION 'order_lines.allocation_ids survived the drop'; END IF;

  PERFORM 1 FROM information_schema.table_constraints
   WHERE constraint_schema='public' AND constraint_name='capacity_allocations_order_line_id_fkey';
  IF NOT FOUND THEN RAISE EXCEPTION 'capacity_allocations.order_line_id has no FK to order_lines'; END IF;

  PERFORM 1 FROM information_schema.columns
   WHERE table_schema='public' AND table_name='inquiry_offer_line_items'
     AND column_name='source_service_id' AND data_type='uuid';
  IF NOT FOUND THEN RAISE EXCEPTION 'source_service_id is not uuid'; END IF;

  PERFORM 1 FROM information_schema.table_constraints
   WHERE constraint_schema='public' AND constraint_name='inquiry_offer_line_items_source_service_id_fkey';
  IF NOT FOUND THEN RAISE EXCEPTION 'source_service_id has no FK to talent_offerings'; END IF;
END $$;

COMMIT;
