-- ─────────────────────────────────────────────────────────────────────────────
-- Re-assert `bookings_write_order` as 20261228000144 defined it.
--
-- WHY. On the qa-journeys branch the live function was the 20261228000143 body:
-- it matched `li.source_service_id` against a uuid REGEX, and that column has
-- been a real uuid since 20261228000144. Every "Create booking" on an accepted
-- offer therefore failed inside the AFTER INSERT trigger with
--   operator does not exist: uuid ~ unknown
-- and the operator read that sentence off the screen. `schema_migrations`
-- listed 000144 as applied all the same: a migration that re-creates a
-- function owns every line of it, and something re-created this one from the
-- older text afterwards (the repair script replays a single migration by
-- name). Found 2026-09-10 by the money journey when it tried to mint a
-- project's order from the fixture's accepted offer.
--
-- WHAT. The 000144 body, verbatim, followed by a check that the live function
-- no longer carries the regex and that the column it reads is a uuid. Both are
-- idempotent: on a database that already has the right body this is a no-op
-- that proves it.
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

DO $chk$
DECLARE
  v_def  text;
  v_type text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'bookings_write_order';
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'bookings_write_order is missing';
  END IF;
  IF v_def LIKE '%[0-9a-fA-F]{8}%' THEN
    RAISE EXCEPTION 'bookings_write_order still matches source_service_id against a regex; that column is a uuid';
  END IF;
  SELECT data_type INTO v_type
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'inquiry_offer_line_items'
     AND column_name = 'source_service_id';
  IF v_type IS DISTINCT FROM 'uuid' THEN
    RAISE EXCEPTION 'inquiry_offer_line_items.source_service_id is % , expected uuid', v_type;
  END IF;
END
$chk$;
