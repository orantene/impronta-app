-- Phase 0.5c — the commission context reads ORDER LINES when an order exists.
--
-- Held since 0.5 and now unblocked: doing this before Finance's grain fix
-- (20261226000017) would have baked a live P0 into the new path and made it
-- look intentional. `unit_price` was per unit while `talent_cost` was a line
-- total, and the context passed both as per-unit to a resolver that multiplies
-- both by units — a $200.00 talent cost measured as $400.00 on a 2-unit line,
-- paid out of the platform balance. Fixed, verified, and only now safe to
-- extend.
--
-- WHAT CHANGES. `engine_load_commission_context` currently reads
-- `inquiry_offer_line_items` and converts NUMERIC major units to cents inline.
-- It now calls one function that prefers `order_lines` when the booking has an
-- `order_id` and falls back to offer lines otherwise. Both branches go through
-- `public.offer_major_to_cents` so the two paths cannot round differently.
--
-- The order branch needs no conversion at all: `order_lines.total_cents` and
-- `.talent_cost_cents` are integer cents already. That is the point of the
-- order spine — money stops being converted between layers.
--
-- HOW, and why not by hand. Replacing this function means CREATE OR REPLACE on
-- ~200 lines of SECURITY DEFINER money code, and a transcription slip there is
-- a bad trade for a one-expression change. Finance solved this in
-- 20261226000018 by reading `prosrc` and patching it, and this does the same —
-- but LOCATED BY ANCHORS rather than by matching an 800-character literal, so
-- an unrelated comment edit upstream cannot make the patch silently no-op.
-- Every anchor is asserted before use and the result is asserted after.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. One place that answers "what lines does this participant get paid for".
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.commission_line_items_for(
  p_booking_id      UUID,
  p_lane            TEXT,
  p_talent_profile  UUID,
  p_owning_party    UUID
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order_id   UUID;
  v_inquiry_id UUID;
  v_offer_id   UUID;
  v_out        JSONB;
BEGIN
  SELECT b.order_id, b.source_inquiry_id
    INTO v_order_id, v_inquiry_id
    FROM public.agency_bookings b
   WHERE b.id = p_booking_id;

  -- ── The order branch. Preferred when it exists.
  IF v_order_id IS NOT NULL THEN
    SELECT jsonb_agg(
             jsonb_build_object(
               -- GRAIN: line totals with units = 1, matching the offer branch
               -- and the resolver's contract. Never per-unit.
               'units', 1::numeric,
               'line_total_cents', ol.total_cents,
               -- House lane forces 0. Never read the column: a stray value
               -- silently shrinks the workspace payout.
               'talent_cost_total_cents',
                 CASE WHEN p_lane = 'house' THEN 0 ELSE ol.talent_cost_cents END
             ) ORDER BY ol.sort_order, ol.id
           )
      INTO v_out
      FROM public.order_lines ol
     WHERE ol.order_id = v_order_id
       AND (
         (p_lane = 'talent' AND ol.talent_profile_id = p_talent_profile)
         OR (p_lane = 'house' AND ol.owner_tenant_id = p_owning_party)
       );

    -- An order with no line for this participant is NOT the same as no order.
    -- Falling through to offer lines here would double-count a participant
    -- whose order line simply belongs to a different lane.
    RETURN v_out;
  END IF;

  -- ── The offer branch, unchanged in behaviour.
  SELECT io.id INTO v_offer_id
    FROM public.inquiry_offers io
   WHERE io.inquiry_id = v_inquiry_id
     AND io.status = 'accepted'
   ORDER BY io.accepted_at DESC NULLS LAST, io.created_at DESC
   LIMIT 1;

  IF v_offer_id IS NULL THEN RETURN NULL; END IF;

  SELECT jsonb_agg(
           jsonb_build_object(
             'units', 1::numeric,
             -- Via offer_major_to_cents, NOT an inline `* 100`. Two rounding
             -- implementations of one conversion is how a per-line cent of
             -- drift appears months later in a payout that will not reconcile.
             'line_total_cents', public.offer_major_to_cents(li.total_price),
             'talent_cost_total_cents',
               CASE WHEN p_lane = 'house' THEN 0
                    ELSE public.offer_major_to_cents(li.talent_cost) END
           ) ORDER BY li.id
         )
    INTO v_out
    FROM public.inquiry_offer_line_items li
   WHERE li.offer_id = v_offer_id
     AND (
       (p_lane = 'talent' AND li.talent_profile_id = p_talent_profile)
       OR (p_lane = 'house' AND li.owner_tenant_id = p_owning_party)
     );

  RETURN v_out;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.commission_line_items_for(UUID, TEXT, UUID, UUID)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.commission_line_items_for(UUID, TEXT, UUID, UUID) IS
  'The lines a participant is paid for. Prefers order_lines when the booking has an order_id, '
  'falls back to the accepted offer. Both branches emit line totals with units=1 and share '
  'offer_major_to_cents so they cannot round differently.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Point the context at it, by patching prosrc between verified anchors.
-- ─────────────────────────────────────────────────────────────────────────────
DO $outer$
DECLARE
  v_src   TEXT;
  v_head  INT;
  v_tail  INT;
  v_new   TEXT;
BEGIN
  SELECT prosrc INTO v_src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'engine_load_commission_context';

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'engine_load_commission_context not found';
  END IF;

  -- Refuse if the grain fix is not in place. Patching a function that still
  -- passes per-unit values would carry the P0 into the order branch.
  IF position('line_total_cents' IN v_src) = 0 THEN
    RAISE EXCEPTION
      'expected the grain fix + rename (20261226000017/18) to be applied first — line_total_cents absent';
  END IF;

  IF position('commission_line_items_for' IN v_src) > 0 THEN
    RAISE NOTICE 'already patched — nothing to do';
    RETURN;
  END IF;

  -- Anchors, not a literal. The block runs from the aggregate that builds the
  -- line array to the alias it is bound to.
  v_head := position('SELECT jsonb_agg(jsonb_build_object(' IN v_src);
  v_tail := position(') AS line_items' IN v_src);

  IF v_head = 0 THEN RAISE EXCEPTION 'anchor missing: line-items aggregate'; END IF;
  IF v_tail = 0 THEN RAISE EXCEPTION 'anchor missing: AS line_items'; END IF;
  IF v_tail <= v_head THEN RAISE EXCEPTION 'anchors out of order — refusing to patch blind'; END IF;

  -- THE ANCHOR MUST BE UNIQUE. `position()` returns the FIRST match, so a
  -- second occurrence means this patch would cut out a block it was never
  -- looking at — and the function contains a second, outer `jsonb_agg` over
  -- participants. Refuse rather than guess which one was meant.
  IF (length(v_src) - length(replace(v_src, 'SELECT jsonb_agg(jsonb_build_object(', ''))) 
     / length('SELECT jsonb_agg(jsonb_build_object(') <> 1 THEN
    RAISE EXCEPTION 'line-items anchor is not unique — refusing to patch the wrong block';
  END IF;
  IF (length(v_src) - length(replace(v_src, ') AS line_items', ''))) 
     / length(') AS line_items') <> 1 THEN
    RAISE EXCEPTION 'AS line_items anchor is not unique — refusing to patch the wrong block';
  END IF;

  -- Note `FROM v_tail`, not `v_tail + 1`: the subquery is wrapped in parens as
  -- `( SELECT ... ) AS line_items`, and the head anchor starts INSIDE the open
  -- paren. Skipping the closing paren orphans the opening one and the patched
  -- body fails to parse — which is exactly what happened on the first attempt.
  v_new :=
    substring(v_src FROM 1 FOR v_head - 1)
    || 'public.commission_line_items_for(p_booking_id, ap.lane, ap.talent_profile_id, ap.owning_party_id)'
    || substring(v_src FROM v_tail);

  EXECUTE
    'CREATE OR REPLACE FUNCTION public.engine_load_commission_context(p_booking_id uuid) '
    || 'RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''public'' AS $body$'
    || v_new
    || '$body$';

  RAISE NOTICE 'context patched to read order lines when an order exists';
END $outer$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Assert the patch took, in both directions.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE v_src TEXT;
BEGIN
  SELECT prosrc INTO v_src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'engine_load_commission_context';

  IF position('commission_line_items_for' IN v_src) = 0 THEN
    RAISE EXCEPTION 'patch did not take: the context does not call commission_line_items_for';
  END IF;

  -- And the old inline LINE-BUILDING is gone, so there is not a second copy of
  -- the grain rule for someone to edit.
  --
  -- Checked on 'line_total_cents' rather than on the table name. The first
  -- version of this assertion looked for `FROM public.inquiry_offer_line_items`
  -- and fired on a read that SHOULD stay: the context also counts unattributed
  -- lines for its owner-completeness guard. The assertion was wrong, not the
  -- patch — and it stopped a correct migration, which is the right way round
  -- for a guard to fail.
  IF position('line_total_cents' IN v_src) > 0 THEN
    RAISE EXCEPTION 'patch left the inline line-items aggregate behind — two copies of the grain rule';
  END IF;

  -- The owner-completeness guard MUST survive. It is the check that refuses an
  -- offer line with no payee, and losing it would let an unattributed line
  -- through to a payout split.
  IF position('v_unattributed_count' IN v_src) = 0 THEN
    RAISE EXCEPTION 'patch removed the unattributed-line guard';
  END IF;

  IF NOT has_function_privilege('service_role', 'public.commission_line_items_for(uuid,text,uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role cannot execute commission_line_items_for — the engine would fail';
  END IF;
  IF has_function_privilege('anon', 'public.commission_line_items_for(uuid,text,uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.commission_line_items_for(uuid,text,uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'commission_line_items_for is executable by a client role';
  END IF;
END $$;

COMMIT;
