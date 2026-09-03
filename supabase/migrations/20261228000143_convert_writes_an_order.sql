-- Phase 0.5 — a converted booking writes its order, in the same transaction.
--
-- ONE ROUNDING EXPRESSION, and why it is the first thing in this file.
--
-- Offer money is NUMERIC major units (`inquiry_offer_line_items.unit_price`,
-- `.talent_cost`, `.total_price`). Orders are integer cents. A conversion
-- already exists inside `engine_load_commission_context`, written inline as
-- `(li.unit_price * 100)::int`.
--
-- If the order path rounds even slightly differently, an order and the
-- commission snapshot computed from the same offer disagree by a cent per line
-- — and that is invisible until real money moves, at which point it is a payout
-- that does not reconcile. So the expression is extracted ONCE and both paths
-- call it. Verified against the existing inline cast across ties and negatives
-- (0.005, 0.015, 0.025, 1.005, 2.675, 10.125, 99.995, -0.005, 1234.565): every
-- value identical. `bigint` rather than `int` also removes the $21.4M ceiling
-- the `::int` cast silently carried.
--
-- WHY A TRIGGER RATHER THAN A LINE INSIDE engine_convert_to_booking.
--
-- The plan said "the convert RPC writes an order". A trigger on
-- `agency_bookings` delivers the same contract and is better in three ways:
--
--   1. `engine_convert_to_booking` is a ~200-line SECURITY DEFINER function.
--      Extending it means CREATE OR REPLACE with the whole body retyped, and a
--      transcription slip in a function that books money is a bad trade for a
--      one-line addition.
--   2. A trigger fires in the SAME transaction as the INSERT, so booking and
--      order still fail together. A booking without its order is exactly the
--      split-brain this phase removes.
--   3. `agency_bookings` rows are created by more than one path. A call site
--      covers convert; the trigger covers every path, including the ones that
--      have not been written yet.
--
-- It is deliberately conservative: it only ever ADDS an order to a booking that
-- has none, and it never raises on a booking it cannot price — a booking with
-- no accepted offer simply gets no order rather than failing to exist.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The one rounding expression.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.offer_major_to_cents(p_major NUMERIC)
RETURNS BIGINT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path TO 'public'
AS $$
  SELECT COALESCE(round(p_major * 100), 0)::bigint;
$$;

COMMENT ON FUNCTION public.offer_major_to_cents(NUMERIC) IS
  'THE major-units-to-cents conversion. Every path that turns offer NUMERIC into order/commission '
  'cents must call this. A second implementation is a per-line rounding drift that only surfaces '
  'after real money moves.';

REVOKE ALL ON FUNCTION public.offer_major_to_cents(NUMERIC) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.offer_major_to_cents(NUMERIC) FROM anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Resolve a customer from contact details, in SQL.
--
-- Mirrors `lib/customers/ensure-customer.ts` exactly, and the rule that cost a
-- migration to learn: EMAIL IS THE IDENTITY. Phone is a lookup key only for a
-- customer with no email at all, because six production client profiles share
-- one phone number and matching on it would merge strangers. See 20261228000141.
--
-- 0.6 collapses the TS function onto this one so there is a single implementation.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ensure_customer_for_tenant(
  p_tenant_id    UUID,
  p_email        TEXT,
  p_phone        TEXT DEFAULT NULL,
  p_display_name TEXT DEFAULT NULL,
  p_user_id      UUID DEFAULT NULL
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
    RETURN NULL;   -- unreachable person; caller decides whether that is fatal
  END IF;

  IF v_email IS NOT NULL THEN
    SELECT id INTO v_id FROM public.customers
     WHERE tenant_id = p_tenant_id AND email = v_email AND merged_into_id IS NULL
     LIMIT 1;
  ELSE
    SELECT id INTO v_id FROM public.customers
     WHERE tenant_id = p_tenant_id AND phone_e164 = v_phone AND merged_into_id IS NULL
     LIMIT 1;
  END IF;

  IF v_id IS NOT NULL THEN
    -- Enrich, never overwrite a known value with null.
    UPDATE public.customers
       SET phone_e164   = COALESCE(phone_e164, v_phone),
           display_name = COALESCE(display_name, v_name),
           user_id      = COALESCE(user_id, p_user_id)
     WHERE id = v_id;
    RETURN v_id;
  END IF;

  INSERT INTO public.customers (tenant_id, email, phone_e164, display_name, user_id)
  VALUES (p_tenant_id, v_email, v_phone, v_name, p_user_id)
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    -- Lost a race against a concurrent insert; the unique index did its job.
    IF v_email IS NOT NULL THEN
      SELECT id INTO v_id FROM public.customers
       WHERE tenant_id = p_tenant_id AND email = v_email AND merged_into_id IS NULL LIMIT 1;
    ELSE
      SELECT id INTO v_id FROM public.customers
       WHERE tenant_id = p_tenant_id AND phone_e164 = v_phone AND merged_into_id IS NULL LIMIT 1;
    END IF;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_customer_for_tenant(UUID, TEXT, TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ensure_customer_for_tenant(UUID, TEXT, TEXT, TEXT, UUID) FROM anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. A booking writes its order.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.bookings_write_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  inq          RECORD;
  v_offer_id   UUID;
  v_currency   TEXT;
  v_customer   UUID;
  v_order_id   UUID;
  v_subtotal   BIGINT;
  v_dropped    INT;
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

  -- No accepted offer: nothing to price. A booking with no order is better than
  -- no booking at all, and the convert RPC has its own guard for this case.
  IF v_offer_id IS NULL THEN RETURN NULL; END IF;

  v_customer := public.ensure_customer_for_tenant(
    COALESCE(NEW.tenant_id_snapshot, inq.tenant_id),
    COALESCE(NEW.contact_email, inq.contact_email),
    COALESCE(NEW.contact_phone, inq.contact_phone),
    COALESCE(NEW.contact_name,  inq.contact_name),
    COALESCE(NEW.client_user_id, inq.client_user_id)
  );

  -- An order needs a buyer. Without a contactable one we cannot make the record
  -- honest, so we make none rather than inventing a placeholder customer.
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
    -- The booking exists because the client accepted; money has not necessarily
    -- moved yet. `paid` is reachable only from a webhook or an explicit staff
    -- pay-in-person action, never from a conversion.
    'pending_payment',
    COALESCE(v_currency, NEW.currency_code, 'USD'),
    v_subtotal, 0, 0, v_subtotal,
    'offer',
    'immediate',
    NEW.created_by_staff_id
  ) RETURNING id INTO v_order_id;

  -- Lines, carrying the payee XOR through unchanged.
  --
  -- `source_service_id` is TEXT, not a uuid FK, so it may hold something that
  -- is not a uuid or names an offering that no longer exists. Cast and drop
  -- rather than failing the conversion; the drop count is raised as a NOTICE
  -- because a silent drop rate is how we would find out that column was never
  -- really a reference.
  INSERT INTO public.order_lines (
    order_id, tenant_id, offering_id, label, units, unit_cents, total_cents,
    talent_profile_id, owner_tenant_id, talent_cost_cents, sort_order
  )
  SELECT
    v_order_id,
    COALESCE(NEW.tenant_id_snapshot, inq.tenant_id),
    CASE
      WHEN li.source_service_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
       AND EXISTS (SELECT 1 FROM public.talent_offerings o WHERE o.id = li.source_service_id::uuid)
      THEN li.source_service_id::uuid
      ELSE NULL
    END,
    COALESCE(NULLIF(trim(li.label), ''), 'Line'),
    GREATEST(COALESCE(li.units, 1), 0.001),
    public.offer_major_to_cents(li.unit_price),
    public.offer_major_to_cents(li.total_price),
    li.talent_profile_id,
    -- The XOR: exactly one side. A line with neither cannot exist on an
    -- accepted offer (engine_load_commission_context refuses it), but if one
    -- ever did, attribute it to the house rather than violate the constraint.
    CASE WHEN li.talent_profile_id IS NULL
         THEN COALESCE(li.owner_tenant_id, NEW.tenant_id_snapshot, inq.tenant_id)
         ELSE NULL END,
    public.offer_major_to_cents(li.talent_cost),
    COALESCE(li.sort_order, 0)
  FROM public.inquiry_offer_line_items li
  WHERE li.offer_id = v_offer_id;

  SELECT count(*) INTO v_dropped
    FROM public.inquiry_offer_line_items li
   WHERE li.offer_id = v_offer_id
     AND li.source_service_id IS NOT NULL
     AND NOT (li.source_service_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
              AND EXISTS (SELECT 1 FROM public.talent_offerings o WHERE o.id = li.source_service_id::uuid));

  IF v_dropped > 0 THEN
    RAISE NOTICE 'order %: % offer line(s) had an unresolvable source_service_id; offering_id left null', v_order_id, v_dropped;
  END IF;

  UPDATE public.agency_bookings SET order_id = v_order_id WHERE id = NEW.id;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS agency_bookings_write_order ON public.agency_bookings;
CREATE TRIGGER agency_bookings_write_order
  AFTER INSERT ON public.agency_bookings
  FOR EACH ROW EXECUTE FUNCTION public.bookings_write_order();

REVOKE ALL ON FUNCTION public.bookings_write_order() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.bookings_write_order() FROM anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Prove the rounding function agrees with the expression it replaces.
--    If these ever diverge, an order and its commission snapshot disagree by a
--    cent per line and nobody notices until a payout fails to reconcile.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v NUMERIC;
BEGIN
  FOREACH v IN ARRAY ARRAY[0.005,0.015,0.025,1.005,2.675,10.125,0.014999,99.995,1234.565,0,1,0.01]::NUMERIC[] LOOP
    IF public.offer_major_to_cents(v) <> (v * 100)::int THEN
      RAISE EXCEPTION 'offer_major_to_cents(%) = % but the existing inline cast gives % — the order and the snapshot would disagree',
        v, public.offer_major_to_cents(v), (v * 100)::int;
    END IF;
  END LOOP;

  IF public.offer_major_to_cents(NULL) <> 0 THEN
    RAISE EXCEPTION 'offer_major_to_cents(NULL) must be 0, got %', public.offer_major_to_cents(NULL);
  END IF;

  IF to_regclass('public.orders') IS NULL THEN
    RAISE EXCEPTION 'convert-writes-order applied before orders exists';
  END IF;
END $$;

COMMIT;
