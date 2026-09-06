-- 20261229000806: receipt_for_code returns SETOF jsonb (zero rows on a miss).
-- Re-apply of …804, which was rolled back by …805 because it was applied under a
-- page that used .maybeSingle() and 500d on a miss. The tolerant reader (#1839,
-- array-or-scalar) is on the live release marker as of 2026-09-05
-- (ea85c3c5b); /r/<bogus> curled 404 before this apply. CODE-FIRST rule.

BEGIN;

DROP FUNCTION IF EXISTS public.receipt_for_code(text);

CREATE FUNCTION public.receipt_for_code(p_code text)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'order', jsonb_build_object(
      'id',            o.id,
      'tenantId',      o.tenant_id,
      'status',        o.status,
      'currency',      o.currency,
      'subtotalCents', o.subtotal_cents,
      'discountCents', o.discount_cents,
      'taxCents',      o.tax_cents,
      'totalCents',    o.total_cents,
      'createdAt',     o.created_at
    ),
    'lines', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id',        l.id,
        'label',     l.label,
        'units',     l.units,
        'unitCents', l.unit_cents,
        'totalCents',l.total_cents,
        'sessionId', l.session_id
      ) ORDER BY l.sort_order, l.created_at)
      FROM public.order_lines l WHERE l.order_id = o.id
    ), '[]'::jsonb),
    'admissions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id',           a.id,
        'tokenVersion', a.token_version,
        'partySize',    a.party_size,
        'admittedCount',a.admitted_count,
        'status',       a.status,
        'holderName',   a.holder_name,
        -- holder_email DELIBERATELY ABSENT. See the header.
        'sessionId',    a.session_id,
        'startsAt',     a.starts_at,
        'lineSeq',      a.line_seq
      ) ORDER BY a.order_line_id, a.line_seq)
      FROM public.admissions a
      JOIN public.order_lines l2 ON l2.id = a.order_line_id
      WHERE l2.order_id = o.id
    ), '[]'::jsonb),
    'sessions', COALESCE((
      SELECT jsonb_agg(DISTINCT jsonb_build_object(
        'id',       s.id,
        'startsAt', s.starts_at,
        'endsAt',   s.ends_at,
        'status',   s.status,
        'eventId',  s.event_id
      ))
      FROM public.sessions s
      WHERE s.id IN (SELECT l3.session_id FROM public.order_lines l3
                      WHERE l3.order_id = o.id AND l3.session_id IS NOT NULL)
    ), '[]'::jsonb)
  )
  FROM public.orders o
  WHERE o.receipt_code = p_code
    -- A null code never matches. Without this, `p_code = NULL` is NULL, which is
    -- correctly no match -- but stating it means the next reader does not have
    -- to reason about three-valued logic to know old orders are unreachable.
    AND o.receipt_code IS NOT NULL
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.receipt_for_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.receipt_for_code(text) TO anon, authenticated;

-- Proof at apply time: an impossible code yields ZERO rows, and anon can
-- still execute the function.
DO $$
DECLARE n int; ok boolean;
BEGIN
  SELECT count(*) INTO n FROM public.receipt_for_code('CODE-THAT-CANNOT-EXIST-9f3a');
  IF n <> 0 THEN RAISE EXCEPTION 'proof failed: receipt_for_code returned % row(s) for an impossible code', n; END IF;
  SELECT has_function_privilege('anon', 'public.receipt_for_code(text)', 'EXECUTE') INTO ok;
  IF NOT ok THEN RAISE EXCEPTION 'proof failed: anon lost EXECUTE on receipt_for_code'; END IF;
END $$;

COMMIT;
