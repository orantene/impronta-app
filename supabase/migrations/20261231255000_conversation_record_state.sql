-- Messages v5 / S2: conversation_records becomes the truth for "what this
-- conversation sells". Until now nothing wrote the table except the manual
-- messaging_link_record RPC (never called), and every chip's payment /
-- fulfilment state was null. This migration:
--
--   1. adds payment_state, fulfilment_state, record_date, updated_at;
--   2. adds messaging_sync_record_state(p_tenant, p_record_kind, p_record_id),
--      a SECURITY DEFINER function the POS writers call AFTER their own
--      success. It derives both states from the record's source table and
--      upserts one conversation_records row per inquiry the record is
--      attached to. Idempotent: two syncs of one record converge on the
--      partial unique index conversation_records_one_live.
--
-- Principle 0: Messages never writes orders / bookings / admissions /
-- payments; this function only READS them. A row staff unlinked on purpose
-- (unlinked_at set, no live twin) is never re-linked by a sync.
--
-- Record ids by kind:
--   order            orders.id
--   appointment      agency_bookings.id
--   reservation      admissions.id  (reserve.ts writes one admission per party)
--   tickets          admissions.id  (mint-on-paid, one per seat)
--   class_enrolment  admissions.id  (same table, session-anchored)
--   project / offer  not derived here (no state table yet) — 'invalid'.

-- ── 1. Columns ──

ALTER TABLE public.conversation_records
  ADD COLUMN IF NOT EXISTS payment_state text,
  ADD COLUMN IF NOT EXISTS fulfilment_state text,
  ADD COLUMN IF NOT EXISTS record_date timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.conversation_records
  DROP CONSTRAINT IF EXISTS conversation_records_payment_state_known;
ALTER TABLE public.conversation_records
  ADD CONSTRAINT conversation_records_payment_state_known CHECK (
    payment_state IS NULL OR payment_state IN (
      'none', 'requested', 'opened', 'paid', 'failed', 'expired', 'refunded', 'partially_refunded', 'unknown'
    ));

ALTER TABLE public.conversation_records
  DROP CONSTRAINT IF EXISTS conversation_records_fulfilment_state_known;
ALTER TABLE public.conversation_records
  ADD CONSTRAINT conversation_records_fulfilment_state_known CHECK (
    fulfilment_state IS NULL OR fulfilment_state IN (
      'none', 'hold', 'confirmed', 'preparing', 'ready', 'fulfilled', 'seated', 'checked_in', 'cancelled'
    ));

COMMENT ON COLUMN public.conversation_records.payment_state IS
  'Derived by messaging_sync_record_state from the source record. NULL = never synced.';
COMMENT ON COLUMN public.conversation_records.fulfilment_state IS
  'Derived by messaging_sync_record_state from the source record. NULL = never synced.';
COMMENT ON COLUMN public.conversation_records.record_date IS
  'The date the record is FOR: order pickup (promised_at) or creation, appointment start, event/session start, reservation start.';

-- ── 2. Order derivation (shared by order and admission-anchored kinds) ──

CREATE OR REPLACE FUNCTION public.messaging_derive_order_state(
  p_order_id uuid,
  OUT payment_state text,
  OUT fulfilment_state text,
  OUT record_date timestamptz,
  OUT inquiry_ids uuid[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.orders%ROWTYPE;
  v_refunded bigint := 0;
  v_line_total bigint := 0;
  v_link_open boolean := false;
  v_link_expired boolean := false;
  v_txn_failed boolean := false;
  v_prep_status text;
  v_prep_handed_off timestamptz;
  v_prep_promised timestamptz;
BEGIN
  payment_state := NULL;
  fulfilment_state := NULL;
  record_date := NULL;
  inquiry_ids := ARRAY[]::uuid[];

  SELECT * INTO o FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT COALESCE(SUM(refunded_cents), 0), COALESCE(SUM(total_cents), 0)
    INTO v_refunded, v_line_total
    FROM public.order_lines WHERE order_id = o.id;

  SELECT COALESCE(bool_or(status = 'open'), false), COALESCE(bool_or(status = 'expired'), false)
    INTO v_link_open, v_link_expired
    FROM public.payment_links WHERE order_id = o.id;

  v_txn_failed := EXISTS (
    SELECT 1 FROM public.booking_transactions WHERE order_id = o.id AND status = 'failed'
  );

  SELECT status, handed_off_at, promised_at
    INTO v_prep_status, v_prep_handed_off, v_prep_promised
    FROM public.preparation_tickets
   WHERE order_id = o.id AND status <> 'cancelled'
   ORDER BY submitted_at DESC
   LIMIT 1;

  payment_state := CASE o.status::text
    WHEN 'refunded' THEN 'refunded'
    WHEN 'partially_refunded' THEN 'partially_refunded'
    WHEN 'paid' THEN CASE
      WHEN v_line_total > 0 AND v_refunded >= v_line_total THEN 'refunded'
      WHEN v_refunded > 0 THEN 'partially_refunded'
      ELSE 'paid' END
    WHEN 'fulfilled' THEN CASE
      WHEN v_line_total > 0 AND v_refunded >= v_line_total THEN 'refunded'
      WHEN v_refunded > 0 THEN 'partially_refunded'
      ELSE 'paid' END
    WHEN 'pending_payment' THEN 'opened'
    WHEN 'cancelled' THEN CASE
      WHEN v_txn_failed THEN 'failed'
      WHEN v_link_expired AND NOT v_link_open THEN 'expired'
      ELSE 'none' END
    ELSE CASE  -- draft, quoted
      WHEN v_link_open THEN 'requested'
      WHEN v_link_expired THEN 'expired'
      WHEN v_txn_failed THEN 'failed'
      ELSE 'none' END
  END;

  fulfilment_state := CASE
    WHEN o.status IN ('cancelled', 'refunded') THEN 'cancelled'
    WHEN o.status = 'fulfilled' THEN 'fulfilled'
    WHEN v_prep_handed_off IS NOT NULL THEN 'fulfilled'
    WHEN v_prep_status = 'ready' THEN 'ready'
    WHEN v_prep_status = 'acknowledged' THEN 'preparing'
    WHEN v_prep_status = 'queued' THEN 'confirmed'
    WHEN o.status IN ('paid', 'partially_refunded') THEN 'confirmed'
    WHEN o.status = 'pending_payment' THEN 'hold'
    ELSE 'none'
  END;

  record_date := COALESCE(v_prep_promised, o.created_at);

  SELECT COALESCE(array_agg(DISTINCT x.inquiry_id), ARRAY[]::uuid[]) INTO inquiry_ids
    FROM (
      SELECT o.inquiry_id
      UNION SELECT pl.inquiry_id FROM public.payment_links pl WHERE pl.order_id = o.id
      UNION SELECT b.source_inquiry_id FROM public.agency_bookings b WHERE b.order_id = o.id
    ) x
   WHERE x.inquiry_id IS NOT NULL;
END;
$$;

-- ── 3. The sync ──

CREATE OR REPLACE FUNCTION public.messaging_sync_record_state(
  p_tenant uuid,
  p_record_kind text,
  p_record_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment text;
  v_fulfilment text;
  v_date timestamptz;
  v_inquiries uuid[] := ARRAY[]::uuid[];
  v_inq uuid;
  v_linked integer := 0;
  -- appointment
  b public.agency_bookings%ROWTYPE;
  v_bf_status text;
  v_txn_status text;
  -- admission
  a public.admissions%ROWTYPE;
  v_order_id uuid;
  v_session_starts timestamptz;
  v_derived record;
BEGIN
  IF p_tenant IS NULL OR p_record_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  IF p_record_kind = 'order' THEN
    IF NOT EXISTS (SELECT 1 FROM public.orders WHERE id = p_record_id AND tenant_id = p_tenant) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
    END IF;
    SELECT * INTO v_derived FROM public.messaging_derive_order_state(p_record_id);
    v_payment := v_derived.payment_state;
    v_fulfilment := v_derived.fulfilment_state;
    v_date := v_derived.record_date;
    v_inquiries := v_derived.inquiry_ids;

  ELSIF p_record_kind = 'appointment' THEN
    SELECT * INTO b FROM public.agency_bookings
     WHERE id = p_record_id
       AND (tenant_id = p_tenant
            OR EXISTS (SELECT 1 FROM public.inquiries i WHERE i.id = agency_bookings.source_inquiry_id AND i.tenant_id = p_tenant));
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;

    SELECT status INTO v_txn_status
      FROM public.booking_transactions
     WHERE booking_id = b.id AND status NOT IN ('cancelled')
     ORDER BY created_at DESC
     LIMIT 1;

    v_payment := CASE
      WHEN b.payment_status::text = 'refunded' OR b.client_revenue_lifecycle = 'refunded' THEN 'refunded'
      WHEN b.payment_status::text = 'paid' OR b.client_revenue_lifecycle = 'fully_paid' THEN 'paid'
      WHEN b.client_revenue_lifecycle = 'failed' OR v_txn_status = 'failed' THEN 'failed'
      WHEN b.payment_status::text = 'partial' OR b.client_revenue_lifecycle = 'deposit_paid' THEN 'requested'
      WHEN v_txn_status = 'pending' THEN 'opened'
      WHEN v_txn_status = 'payment_requested' THEN 'requested'
      ELSE 'none'
    END;

    SELECT status INTO v_bf_status FROM public.booking_fulfillment WHERE booking_id = b.id;

    v_fulfilment := CASE
      WHEN b.status::text IN ('cancelled', 'archived') THEN 'cancelled'
      WHEN b.status::text = 'completed' THEN 'fulfilled'
      WHEN v_bf_status IN ('delivered', 'picked_up', 'downloaded', 'completed') THEN 'fulfilled'
      WHEN v_bf_status = 'returned' THEN 'cancelled'
      WHEN v_bf_status IN ('ready_for_pickup', 'shipped') THEN 'ready'
      WHEN v_bf_status = 'preparing' THEN 'preparing'
      WHEN b.status::text = 'in_progress' THEN 'checked_in'
      WHEN b.status::text = 'confirmed' THEN 'confirmed'
      ELSE 'hold'  -- draft, tentative
    END;

    v_date := COALESCE(b.starts_at, b.event_date::timestamptz);

    SELECT COALESCE(array_agg(DISTINCT x.inquiry_id), ARRAY[]::uuid[]) INTO v_inquiries
      FROM (
        SELECT b.source_inquiry_id AS inquiry_id
        UNION SELECT o.inquiry_id FROM public.orders o WHERE o.id = b.order_id
        UNION SELECT pl.inquiry_id FROM public.payment_links pl WHERE pl.order_id = b.order_id
      ) x
     WHERE x.inquiry_id IS NOT NULL;

  ELSIF p_record_kind IN ('reservation', 'tickets', 'class_enrolment') THEN
    SELECT * INTO a FROM public.admissions WHERE id = p_record_id AND tenant_id = p_tenant;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;

    SELECT ol.order_id INTO v_order_id FROM public.order_lines ol WHERE ol.id = a.order_line_id;
    SELECT s.starts_at INTO v_session_starts FROM public.sessions s WHERE s.id = a.session_id;

    IF v_order_id IS NOT NULL THEN
      SELECT * INTO v_derived FROM public.messaging_derive_order_state(v_order_id);
      v_payment := v_derived.payment_state;
      v_inquiries := v_derived.inquiry_ids;
      v_date := COALESCE(a.starts_at, v_session_starts, v_derived.record_date);
    ELSE
      v_payment := CASE WHEN a.door_amount_cents IS NOT NULL THEN 'paid' ELSE 'none' END;
      v_date := COALESCE(a.starts_at, v_session_starts);
    END IF;
    IF a.status = 'refunded' THEN v_payment := 'refunded'; END IF;

    v_fulfilment := CASE
      WHEN a.status IN ('void', 'refunded') THEN 'cancelled'
      WHEN a.completed_at IS NOT NULL THEN 'fulfilled'
      WHEN a.no_show_at IS NOT NULL THEN 'cancelled'
      WHEN a.seated_at IS NOT NULL THEN 'seated'
      WHEN a.admitted_count > 0 THEN 'checked_in'
      WHEN v_payment = 'opened' THEN 'hold'
      ELSE 'confirmed'
    END;

  ELSE
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  -- Live rows staff linked by hand to some other inquiry follow the record too.
  UPDATE public.conversation_records cr
     SET payment_state = v_payment,
         fulfilment_state = v_fulfilment,
         record_date = v_date,
         updated_at = now(),
         version = cr.version + 1
   WHERE cr.tenant_id = p_tenant
     AND cr.record_kind = p_record_kind
     AND cr.record_id = p_record_id
     AND cr.unlinked_at IS NULL
     AND (cr.payment_state IS DISTINCT FROM v_payment
          OR cr.fulfilment_state IS DISTINCT FROM v_fulfilment
          OR cr.record_date IS DISTINCT FROM v_date);

  FOREACH v_inq IN ARRAY v_inquiries LOOP
    IF NOT EXISTS (SELECT 1 FROM public.inquiries WHERE id = v_inq AND tenant_id = p_tenant) THEN
      CONTINUE;  -- never link across tenants
    END IF;
    -- Staff unlinked this record from this conversation on purpose: respect it.
    IF EXISTS (
      SELECT 1 FROM public.conversation_records
       WHERE tenant_id = p_tenant AND inquiry_id = v_inq AND record_kind = p_record_kind
         AND record_id = p_record_id AND unlinked_at IS NOT NULL
    ) AND NOT EXISTS (
      SELECT 1 FROM public.conversation_records
       WHERE tenant_id = p_tenant AND inquiry_id = v_inq AND record_kind = p_record_kind
         AND record_id = p_record_id AND unlinked_at IS NULL
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.conversation_records
      (tenant_id, inquiry_id, record_kind, record_id, linked_by, payment_state, fulfilment_state, record_date, updated_at)
    VALUES
      (p_tenant, v_inq, p_record_kind, p_record_id, NULL, v_payment, v_fulfilment, v_date, now())
    ON CONFLICT (tenant_id, inquiry_id, record_kind, record_id) WHERE unlinked_at IS NULL
    DO UPDATE SET
      payment_state = EXCLUDED.payment_state,
      fulfilment_state = EXCLUDED.fulfilment_state,
      record_date = EXCLUDED.record_date,
      updated_at = now(),
      version = public.conversation_records.version + 1
    WHERE public.conversation_records.payment_state IS DISTINCT FROM EXCLUDED.payment_state
       OR public.conversation_records.fulfilment_state IS DISTINCT FROM EXCLUDED.fulfilment_state
       OR public.conversation_records.record_date IS DISTINCT FROM EXCLUDED.record_date;
  END LOOP;

  SELECT count(*) INTO v_linked
    FROM public.conversation_records
   WHERE tenant_id = p_tenant AND record_kind = p_record_kind AND record_id = p_record_id AND unlinked_at IS NULL;

  RETURN jsonb_build_object(
    'ok', true,
    'linked', v_linked,
    'payment_state', v_payment,
    'fulfilment_state', v_fulfilment,
    'record_date', v_date
  );
END;
$$;

-- ── 4. Grants: service_role only ──

DO $grants$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.messaging_derive_order_state(uuid)',
    'public.messaging_sync_record_state(uuid,text,uuid)'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
    IF has_function_privilege('anon', fn::regprocedure, 'EXECUTE') THEN
      RAISE EXCEPTION '% is executable by anon', fn;
    END IF;
    IF has_function_privilege('authenticated', fn::regprocedure, 'EXECUTE') THEN
      RAISE EXCEPTION '% is executable by authenticated', fn;
    END IF;
    IF NOT has_function_privilege('service_role', fn::regprocedure, 'EXECUTE') THEN
      RAISE EXCEPTION '% is not executable by service_role', fn;
    END IF;
  END LOOP;
END
$grants$;

-- ── 5. Proof: an unknown kind and a missing record are refusals, never writes ──

DO $proof$
DECLARE
  v_res jsonb;
  v_before bigint;
  v_after bigint;
BEGIN
  SELECT count(*) INTO v_before FROM public.conversation_records;
  v_res := public.messaging_sync_record_state(gen_random_uuid(), 'project', gen_random_uuid());
  IF v_res->>'reason' IS DISTINCT FROM 'invalid' THEN
    RAISE EXCEPTION 'sync of an underived kind should refuse invalid, got %', v_res;
  END IF;
  v_res := public.messaging_sync_record_state(gen_random_uuid(), 'order', gen_random_uuid());
  IF v_res->>'reason' IS DISTINCT FROM 'not_found' THEN
    RAISE EXCEPTION 'sync of a missing order should refuse not_found, got %', v_res;
  END IF;
  SELECT count(*) INTO v_after FROM public.conversation_records;
  IF v_after <> v_before THEN
    RAISE EXCEPTION 'a refused sync wrote rows (% -> %)', v_before, v_after;
  END IF;
END
$proof$;
