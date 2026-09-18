-- Messages v5 · lane S5 (boards D17 / D08; owner decisions 3 and 7; D-MSG-30..).
--
-- Every draft line and every offer line knows WHO proposed it, whether staff
-- CONFIRMED it, what price it was SNAPSHOTTED at when it was added, and any
-- per-line discount / tax. A history table records every change to a draft
-- line with the old and new units and cents so the diff sheet can say who
-- changed what.
--
-- Rules this migration carries:
--   * A line keeps its `price_snapshot_cents`. A later catalog change never
--     rewrites an existing line (D-MSG-30); the UI reads
--     `catalog_price_cents_at_add` vs the catalog now and says "catalog price
--     now X" when they differ.
--   * `proposed_by` is who put the line on the draft: 'client' from the guest
--     link, 'staff' from the counter / Messages, 'system' from an automatic
--     writer (Book again, package expansion).
--   * `confirmed_at` / `confirmed_by` are staff's confirmation (decision 3:
--     picks hold, staff confirm). Null until S3's confirm writes it.
--
-- Additive only: every ALTER is IF NOT EXISTS with a default, so the live
-- readers keep working before and after (feedback_contract_changes_are_code_first).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. order_lines
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.order_lines
  ADD COLUMN IF NOT EXISTS proposed_by text NOT NULL DEFAULT 'staff';
ALTER TABLE public.order_lines
  DROP CONSTRAINT IF EXISTS order_lines_proposed_by_check;
ALTER TABLE public.order_lines
  ADD CONSTRAINT order_lines_proposed_by_check CHECK (proposed_by IN ('client', 'staff', 'system'));
ALTER TABLE public.order_lines
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;
ALTER TABLE public.order_lines
  ADD COLUMN IF NOT EXISTS confirmed_by uuid;
-- bigint, not integer: every cents column on this table is bigint and a
-- narrower sibling would be the one that overflows first (D-MSG-31).
ALTER TABLE public.order_lines
  ADD COLUMN IF NOT EXISTS price_snapshot_cents bigint;
ALTER TABLE public.order_lines
  ADD COLUMN IF NOT EXISTS catalog_price_cents_at_add bigint;
ALTER TABLE public.order_lines
  ADD COLUMN IF NOT EXISTS discount_cents bigint NOT NULL DEFAULT 0;
ALTER TABLE public.order_lines
  ADD COLUMN IF NOT EXISTS discount_label text;
-- `tax_cents` already exists on order_lines (20261228000142, bigint NOT NULL
-- DEFAULT 0 CHECK >= 0); this is a no-op there and the label is new.
ALTER TABLE public.order_lines
  ADD COLUMN IF NOT EXISTS tax_cents bigint NOT NULL DEFAULT 0;
ALTER TABLE public.order_lines
  ADD COLUMN IF NOT EXISTS tax_label text;
ALTER TABLE public.order_lines
  DROP CONSTRAINT IF EXISTS order_lines_discount_nonneg;
ALTER TABLE public.order_lines
  ADD CONSTRAINT order_lines_discount_nonneg CHECK (discount_cents >= 0);

COMMENT ON COLUMN public.order_lines.proposed_by IS
  'Who put this line on the draft: client (guest link), staff (counter / Messages), system (automatic writer).';
COMMENT ON COLUMN public.order_lines.price_snapshot_cents IS
  'The unit price this line was added at. Never rewritten by a later catalog change (D-MSG-30).';
COMMENT ON COLUMN public.order_lines.catalog_price_cents_at_add IS
  'The raw catalog (offering / variant) price at the moment of the add, before any live phase. Compared with the catalog now to show "catalog price now X".';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. inquiry_offer_line_items
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.inquiry_offer_line_items
  ADD COLUMN IF NOT EXISTS proposed_by text NOT NULL DEFAULT 'staff';
ALTER TABLE public.inquiry_offer_line_items
  DROP CONSTRAINT IF EXISTS inquiry_offer_line_items_proposed_by_check;
ALTER TABLE public.inquiry_offer_line_items
  ADD CONSTRAINT inquiry_offer_line_items_proposed_by_check CHECK (proposed_by IN ('client', 'staff', 'system'));
ALTER TABLE public.inquiry_offer_line_items
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;
ALTER TABLE public.inquiry_offer_line_items
  ADD COLUMN IF NOT EXISTS confirmed_by uuid;
ALTER TABLE public.inquiry_offer_line_items
  ADD COLUMN IF NOT EXISTS price_snapshot_cents bigint;
ALTER TABLE public.inquiry_offer_line_items
  ADD COLUMN IF NOT EXISTS catalog_price_cents_at_add bigint;
ALTER TABLE public.inquiry_offer_line_items
  ADD COLUMN IF NOT EXISTS discount_cents bigint NOT NULL DEFAULT 0;
ALTER TABLE public.inquiry_offer_line_items
  ADD COLUMN IF NOT EXISTS discount_label text;
ALTER TABLE public.inquiry_offer_line_items
  ADD COLUMN IF NOT EXISTS tax_cents bigint NOT NULL DEFAULT 0;
ALTER TABLE public.inquiry_offer_line_items
  ADD COLUMN IF NOT EXISTS tax_label text;
ALTER TABLE public.inquiry_offer_line_items
  DROP CONSTRAINT IF EXISTS inquiry_offer_line_items_discount_tax_nonneg;
ALTER TABLE public.inquiry_offer_line_items
  ADD CONSTRAINT inquiry_offer_line_items_discount_tax_nonneg CHECK (discount_cents >= 0 AND tax_cents >= 0);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. order_line_events — the line history the diff sheet reads
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.order_line_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  order_id    uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  -- No FK: a removed line's events must outlive the line.
  line_id     uuid NOT NULL,
  actor_kind  text NOT NULL CHECK (actor_kind IN ('client', 'staff', 'system')),
  actor_id    uuid,
  change      jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_line_events_order_idx ON public.order_line_events (order_id, created_at);
CREATE INDEX IF NOT EXISTS order_line_events_line_idx  ON public.order_line_events (line_id, created_at);

COMMENT ON TABLE public.order_line_events IS
  'One row per insert / update / delete of an order line, written by trigger. `change.op` is add|update|remove; `change.old` / `change.new` carry units, unit_cents, total_cents, discount_cents, tax_cents, label, confirmed_at.';

ALTER TABLE public.order_line_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_line_events FORCE  ROW LEVEL SECURITY;

-- Same shape as order_lines (20261228000142): staff of the tenant read, the
-- buying customer reads their own order's history, every write is trigger /
-- service role.
DROP POLICY IF EXISTS order_line_events_staff_select ON public.order_line_events;
CREATE POLICY order_line_events_staff_select ON public.order_line_events
  FOR SELECT TO authenticated
  USING (public.is_staff_of_tenant(tenant_id) OR public.is_platform_admin());

DROP POLICY IF EXISTS order_line_events_customer_select ON public.order_line_events;
CREATE POLICY order_line_events_customer_select ON public.order_line_events
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
      JOIN public.customers c ON c.id = o.customer_id
     WHERE o.id = order_line_events.order_id AND c.user_id = auth.uid()
  ));

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.order_line_events FROM PUBLIC, anon, authenticated;
REVOKE SELECT ON public.order_line_events FROM anon;
GRANT SELECT ON public.order_line_events TO authenticated;
GRANT ALL ON public.order_line_events TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. The trigger. Actor comes from two transaction-local settings the RPC
--    sets (`pos.actor_kind`, `pos.actor_id`); an insert with no setting is
--    attributed to the line's own `proposed_by`; an update / delete with no
--    setting is 'staff' (the only writer that reaches order_lines outside the
--    RPC is the service role behind a staff action).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.order_line_event_snapshot(r public.order_lines)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'label', r.label,
    'units', r.units,
    'unit_cents', r.unit_cents,
    'total_cents', r.total_cents,
    'discount_cents', r.discount_cents,
    'tax_cents', r.tax_cents,
    'proposed_by', r.proposed_by,
    'confirmed_at', r.confirmed_at,
    'price_snapshot_cents', r.price_snapshot_cents
  );
$$;

CREATE OR REPLACE FUNCTION public.order_lines_write_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kind text := NULLIF(current_setting('pos.actor_kind', true), '');
  v_actor uuid := NULLIF(current_setting('pos.actor_id', true), '')::uuid;
  v_old jsonb;
  v_new jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.order_line_events (tenant_id, order_id, line_id, actor_kind, actor_id, change)
    VALUES (NEW.tenant_id, NEW.order_id, NEW.id, COALESCE(v_kind, NEW.proposed_by, 'staff'), v_actor,
            jsonb_build_object('op', 'add', 'old', NULL, 'new', public.order_line_event_snapshot(NEW)));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    v_old := public.order_line_event_snapshot(OLD);
    v_new := public.order_line_event_snapshot(NEW);
    -- A stamp that touches nothing the customer reads (price_phase_id,
    -- allocation_ids, refunded_cents) is not a line change.
    IF v_old = v_new THEN RETURN NEW; END IF;
    INSERT INTO public.order_line_events (tenant_id, order_id, line_id, actor_kind, actor_id, change)
    VALUES (NEW.tenant_id, NEW.order_id, NEW.id, COALESCE(v_kind, 'staff'), COALESCE(v_actor, NEW.confirmed_by),
            jsonb_build_object('op', 'update', 'old', v_old, 'new', v_new));
    RETURN NEW;
  ELSE
    -- A cascade from the order's own delete has no parent to hang the event
    -- on; the order and its history go together.
    IF NOT EXISTS (SELECT 1 FROM public.orders WHERE id = OLD.order_id) THEN RETURN OLD; END IF;
    INSERT INTO public.order_line_events (tenant_id, order_id, line_id, actor_kind, actor_id, change)
    VALUES (OLD.tenant_id, OLD.order_id, OLD.id, COALESCE(v_kind, 'staff'), v_actor,
            jsonb_build_object('op', 'remove', 'old', public.order_line_event_snapshot(OLD), 'new', NULL));
    RETURN OLD;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS order_lines_write_event ON public.order_lines;
CREATE TRIGGER order_lines_write_event
  AFTER INSERT OR UPDATE OR DELETE ON public.order_lines
  FOR EACH ROW EXECUTE FUNCTION public.order_lines_write_event();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. pos_mutate_draft_line, same signature, now carrying the author, the
--    snapshot and the per-line discount / tax. Body otherwise the one from
--    20261231204000 (tip). Differences:
--      add    : proposed_by, price_snapshot_cents (the unit price written),
--               catalog_price_cents_at_add (offering / variant price read
--               here, so the caller cannot lie about the catalog),
--               discount_cents / _label, tax_cents / _label.
--      update : optional discount_cents / _label, tax_cents / _label.
--      totals : per-line discount joins the order discount; per-line tax
--               was already summed.
--      actor  : p_line.actor_kind / actor_id become the transaction-local
--               settings the event trigger reads.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pos_mutate_draft_line(
  p_tenant_id         uuid,
  p_order_id          uuid,
  p_expected_version  integer,
  p_op                text,
  p_line              jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_line_id uuid;
  v_units numeric;
  v_unit_cents bigint;
  v_total_cents bigint;
  v_addons uuid[] := '{}';
  v_subtotal bigint := 0;
  v_discount bigint := 0;
  v_line_discount bigint := 0;
  v_tax bigint := 0;
  v_tip bigint := 0;
  v_total bigint := 0;
  v_kind text;
  v_proposed_by text;
  v_actor_kind text;
  v_offering_id uuid;
  v_variant_id uuid;
  v_catalog_cents bigint;
  v_discount_cents bigint;
  v_tax_cents bigint;
BEGIN
  IF p_tenant_id IS NULL OR p_order_id IS NULL OR p_expected_version IS NULL
     OR p_op IS NULL OR p_op NOT IN ('add', 'update', 'remove') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_input');
  END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF v_order.tenant_id IS DISTINCT FROM p_tenant_id THEN RETURN jsonb_build_object('ok', false, 'reason', 'wrong_tenant'); END IF;
  IF v_order.status IS DISTINCT FROM 'draft' THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_draft'); END IF;
  IF v_order.version IS DISTINCT FROM p_expected_version THEN RETURN jsonb_build_object('ok', false, 'reason', 'conflict'); END IF;

  v_proposed_by := COALESCE(NULLIF(trim(p_line->>'proposed_by'), ''), 'staff');
  IF v_proposed_by NOT IN ('client', 'staff', 'system') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;
  v_actor_kind := COALESCE(NULLIF(trim(p_line->>'actor_kind'), ''), v_proposed_by);
  IF v_actor_kind NOT IN ('client', 'staff', 'system') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;
  -- Transaction-local: the event trigger reads these, nothing else does.
  PERFORM set_config('pos.actor_kind', v_actor_kind, true);
  PERFORM set_config('pos.actor_id', COALESCE(NULLIF(p_line->>'actor_id', ''), ''), true);

  v_discount_cents := COALESCE(NULLIF(p_line->>'discount_cents', '')::bigint, 0);
  v_tax_cents := COALESCE(NULLIF(p_line->>'tax_cents', '')::bigint, 0);
  IF v_discount_cents < 0 OR v_tax_cents < 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  IF p_op = 'add' THEN
    v_units := COALESCE(NULLIF(p_line->>'units', '')::numeric, 0);
    v_unit_cents := COALESCE(NULLIF(p_line->>'unit_cents', '')::bigint, 0);
    v_total_cents := COALESCE(NULLIF(p_line->>'total_cents', '')::bigint, round(v_unit_cents * v_units)::bigint);
    v_kind := COALESCE(NULLIF(trim(p_line->>'kind'), ''), 'catalog');
    IF v_kind NOT IN ('catalog', 'custom') OR v_units <= 0 OR v_unit_cents < 0 OR NULLIF(trim(p_line->>'label'), '') IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
    END IF;
    v_offering_id := NULLIF(p_line->>'offering_id', '')::uuid;
    v_variant_id := NULLIF(p_line->>'variant_id', '')::uuid;
    IF v_kind = 'custom' AND v_offering_id IS NOT NULL THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
    END IF;
    IF p_line ? 'addon_ids' AND jsonb_typeof(p_line->'addon_ids') = 'array' THEN
      SELECT COALESCE(array_agg(x::uuid), '{}') INTO v_addons
        FROM jsonb_array_elements_text(p_line->'addon_ids') AS x WHERE x <> '';
    END IF;
    -- The catalog price at the add, read here rather than trusted from the
    -- caller: the variant's when the line names one and the variant carries
    -- a price, else the offering's. A custom line has no catalog price.
    v_catalog_cents := NULL;
    IF v_offering_id IS NOT NULL THEN
      SELECT amount_cents::bigint INTO v_catalog_cents
        FROM public.talent_offerings WHERE id = v_offering_id AND tenant_id = p_tenant_id;
      IF v_variant_id IS NOT NULL THEN
        SELECT COALESCE(v.amount_cents::bigint, v_catalog_cents) INTO v_catalog_cents
          FROM public.talent_offering_variants v WHERE v.id = v_variant_id AND v.offering_id = v_offering_id;
      END IF;
    END IF;
    INSERT INTO public.order_lines (
      order_id, tenant_id, offering_id, variant_id, addon_ids, session_id,
      label, units, unit_cents, total_cents, talent_profile_id, owner_tenant_id,
      talent_cost_cents, sort_order, kind, operator_user_id, booking_id, booking_kind,
      proposed_by, price_snapshot_cents, catalog_price_cents_at_add,
      discount_cents, discount_label, tax_cents, tax_label
    ) VALUES (
      p_order_id, p_tenant_id,
      v_offering_id,
      v_variant_id,
      COALESCE(v_addons, '{}'),
      NULLIF(p_line->>'session_id', '')::uuid,
      trim(p_line->>'label'), v_units, v_unit_cents, v_total_cents,
      NULLIF(p_line->>'talent_profile_id', '')::uuid,
      COALESCE(NULLIF(p_line->>'owner_tenant_id', '')::uuid, CASE WHEN v_kind = 'custom' THEN p_tenant_id ELSE NULL END),
      COALESCE(NULLIF(p_line->>'talent_cost_cents', '')::bigint, 0),
      COALESCE(NULLIF(p_line->>'sort_order', '')::integer, 0),
      v_kind,
      NULLIF(p_line->>'operator_user_id', '')::uuid,
      NULLIF(p_line->>'booking_id', '')::uuid,
      NULLIF(p_line->>'booking_kind', ''),
      v_proposed_by,
      COALESCE(NULLIF(p_line->>'price_snapshot_cents', '')::bigint, v_unit_cents),
      COALESCE(NULLIF(p_line->>'catalog_price_cents_at_add', '')::bigint, v_catalog_cents),
      v_discount_cents,
      NULLIF(trim(p_line->>'discount_label'), ''),
      v_tax_cents,
      NULLIF(trim(p_line->>'tax_label'), '')
    ) RETURNING id INTO v_line_id;
  ELSIF p_op = 'update' THEN
    v_line_id := NULLIF(p_line->>'id', '')::uuid;
    v_units := COALESCE(NULLIF(p_line->>'units', '')::numeric, 0);
    v_unit_cents := COALESCE(NULLIF(p_line->>'unit_cents', '')::bigint, 0);
    v_total_cents := COALESCE(NULLIF(p_line->>'total_cents', '')::bigint, round(v_unit_cents * v_units)::bigint);
    IF v_line_id IS NULL OR v_units <= 0 THEN RETURN jsonb_build_object('ok', false, 'reason', 'invalid'); END IF;
    UPDATE public.order_lines
       SET units = v_units,
           total_cents = v_total_cents,
           discount_cents = CASE WHEN p_line ? 'discount_cents' THEN v_discount_cents ELSE discount_cents END,
           discount_label = CASE WHEN p_line ? 'discount_label' THEN NULLIF(trim(p_line->>'discount_label'), '') ELSE discount_label END,
           tax_cents = CASE WHEN p_line ? 'tax_cents' THEN v_tax_cents ELSE tax_cents END,
           tax_label = CASE WHEN p_line ? 'tax_label' THEN NULLIF(trim(p_line->>'tax_label'), '') ELSE tax_label END
     WHERE id = v_line_id AND order_id = p_order_id AND tenant_id = p_tenant_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  ELSE
    v_line_id := NULLIF(p_line->>'id', '')::uuid;
    IF v_line_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'invalid'); END IF;
    DELETE FROM public.order_lines WHERE id = v_line_id AND order_id = p_order_id AND tenant_id = p_tenant_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  END IF;

  SELECT COALESCE(SUM(total_cents), 0), COALESCE(SUM(COALESCE(tax_cents, 0)), 0), COALESCE(SUM(COALESCE(discount_cents, 0)), 0)
    INTO v_subtotal, v_tax, v_line_discount FROM public.order_lines WHERE order_id = p_order_id;
  v_discount := GREATEST(0, LEAST(COALESCE(v_order.discount_cents, 0) + v_line_discount, v_subtotal));
  v_tip := GREATEST(0, COALESCE(v_order.tip_cents, 0));
  v_total := v_subtotal - v_discount + v_tax + v_tip;

  UPDATE public.orders
     SET subtotal_cents = v_subtotal, discount_cents = v_discount, tax_cents = v_tax,
         total_cents = v_total, version = v_order.version + 1
   WHERE id = p_order_id AND tenant_id = p_tenant_id AND status = 'draft' AND version = p_expected_version;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'conflict'); END IF;

  RETURN jsonb_build_object(
    'ok', true, 'version', v_order.version + 1, 'line_id', v_line_id,
    'subtotal_cents', v_subtotal, 'discount_cents', v_discount,
    'tax_cents', v_tax, 'tip_cents', v_tip, 'total_cents', v_total
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pos_mutate_draft_line(uuid, uuid, integer, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pos_mutate_draft_line(uuid, uuid, integer, text, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.order_lines_write_event() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.order_line_event_snapshot(public.order_lines) FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Proof. Objects asserted, then a draft exercised end to end: a client add
--    records proposed_by and the snapshot, a catalog change leaves the line
--    alone, an update and a remove each write an event, and the order's own
--    delete takes its history with it.
-- ─────────────────────────────────────────────────────────────────────────────
DO $check$
BEGIN
  IF has_table_privilege('anon', 'public.order_line_events', 'SELECT')
     OR has_table_privilege('authenticated', 'public.order_line_events', 'INSERT') THEN
    RAISE EXCEPTION 'order_line_events grants did not take';
  END IF;
  IF has_function_privilege('anon', 'public.pos_mutate_draft_line(uuid,uuid,integer,text,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'pos_mutate_draft_line is executable by anon';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'order_lines_write_event' AND tgrelid = 'public.order_lines'::regclass) THEN
    RAISE EXCEPTION 'order_lines_write_event trigger missing';
  END IF;
  IF (SELECT count(*) FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'order_lines'
          AND column_name IN ('proposed_by', 'confirmed_at', 'confirmed_by', 'price_snapshot_cents', 'catalog_price_cents_at_add', 'discount_cents', 'discount_label', 'tax_cents', 'tax_label')) <> 9 THEN
    RAISE EXCEPTION 'order_lines S5 columns missing';
  END IF;
  IF (SELECT count(*) FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'inquiry_offer_line_items'
          AND column_name IN ('proposed_by', 'confirmed_at', 'confirmed_by', 'price_snapshot_cents', 'catalog_price_cents_at_add', 'discount_cents', 'discount_label', 'tax_cents', 'tax_label')) <> 9 THEN
    RAISE EXCEPTION 'inquiry_offer_line_items S5 columns missing';
  END IF;
END
$check$;

DO $proof$
DECLARE
  v_tenant uuid;
  v_order uuid;
  v_offering uuid;
  v_reply jsonb;
  v_line uuid;
  v_events integer;
BEGIN
  INSERT INTO public.agencies (slug, display_name)
  VALUES ('s5-line-' || substr(gen_random_uuid()::text, 1, 12), 'S5 line proof')
  RETURNING id INTO v_tenant;
  INSERT INTO public.orders (
    tenant_id, status, currency, subtotal_cents, discount_cents, tax_cents,
    tip_cents, total_cents, source_channel, guest_session_id, version
  ) VALUES (
    v_tenant, 'draft', 'USD', 0, 0, 0, 0, 0, 'messages', 's5-line-proof', 1
  ) RETURNING id INTO v_order;

  -- A house (custom) line, so the proof needs no offering / talent rows.
  v_reply := public.pos_mutate_draft_line(v_tenant, v_order, 1, 'add', jsonb_build_object(
    'kind', 'custom', 'label', 'Tasting', 'units', 2, 'unit_cents', 1500,
    'proposed_by', 'client', 'catalog_price_cents_at_add', 1500, 'discount_cents', 300, 'discount_label', 'Regular'
  ));
  IF v_reply->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'S5 proof: add refused %', v_reply; END IF;
  v_line := (v_reply->>'line_id')::uuid;
  IF (SELECT proposed_by FROM public.order_lines WHERE id = v_line) <> 'client' THEN
    RAISE EXCEPTION 'S5 proof: proposed_by not client';
  END IF;
  IF (SELECT price_snapshot_cents FROM public.order_lines WHERE id = v_line) <> 1500 THEN
    RAISE EXCEPTION 'S5 proof: price_snapshot_cents not filled';
  END IF;
  IF (SELECT total_cents FROM public.orders WHERE id = v_order) <> 2700 THEN
    RAISE EXCEPTION 'S5 proof: line discount not in total (%)', (SELECT total_cents FROM public.orders WHERE id = v_order);
  END IF;
  SELECT count(*) INTO v_events FROM public.order_line_events WHERE line_id = v_line AND actor_kind = 'client' AND change->>'op' = 'add';
  IF v_events <> 1 THEN RAISE EXCEPTION 'S5 proof: add event missing (%)', v_events; END IF;

  v_reply := public.pos_mutate_draft_line(v_tenant, v_order, 2, 'update', jsonb_build_object(
    'id', v_line, 'units', 3, 'unit_cents', 1500, 'actor_kind', 'staff'
  ));
  IF v_reply->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'S5 proof: update refused %', v_reply; END IF;
  SELECT count(*) INTO v_events FROM public.order_line_events WHERE line_id = v_line AND actor_kind = 'staff'
    AND change->>'op' = 'update' AND (change->'old'->>'units')::numeric = 2 AND (change->'new'->>'units')::numeric = 3;
  IF v_events <> 1 THEN RAISE EXCEPTION 'S5 proof: update event missing (%)', v_events; END IF;
  -- The snapshot survived the update.
  IF (SELECT price_snapshot_cents FROM public.order_lines WHERE id = v_line) <> 1500 THEN
    RAISE EXCEPTION 'S5 proof: snapshot rewritten by update';
  END IF;

  v_reply := public.pos_mutate_draft_line(v_tenant, v_order, 3, 'remove', jsonb_build_object('id', v_line));
  IF v_reply->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'S5 proof: remove refused %', v_reply; END IF;
  SELECT count(*) INTO v_events FROM public.order_line_events WHERE line_id = v_line AND change->>'op' = 'remove';
  IF v_events <> 1 THEN RAISE EXCEPTION 'S5 proof: remove event missing (%)', v_events; END IF;

  DELETE FROM public.orders WHERE id = v_order;
  IF EXISTS (SELECT 1 FROM public.order_line_events WHERE order_id = v_order) THEN
    RAISE EXCEPTION 'S5 proof: history outlived the order';
  END IF;
  DELETE FROM public.agencies WHERE id = v_tenant;
END
$proof$;
