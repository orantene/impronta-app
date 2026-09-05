-- ROLLBACK of …804 on production, applied minutes after it: changing
-- `receipt_for_code` from `RETURNS jsonb` to `SETOF jsonb` under the DEPLOYED
-- receipt page turned every unknown code into a 500 (PostgREST returns an
-- array for SETOF; the live page reads `data.order` on what it expects to be
-- a scalar). Schema-first is for ADDITIVE schema; a function SHAPE change is
-- code-first: a page tolerant of both shapes deploys, THEN the function moves.
-- This restores the scalar shape exactly as `…376` defined it, grants included.
-- The SETOF change returns as a later migration applied only after the
-- tolerant page is on the running build.

BEGIN;

DROP FUNCTION IF EXISTS public.receipt_for_code(text);

CREATE FUNCTION public.receipt_for_code(p_code text)
RETURNS jsonb
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

DO $$
DECLARE v jsonb; ok boolean;
BEGIN
  SELECT public.receipt_for_code('CODE-THAT-CANNOT-EXIST-9f3a') INTO v;
  IF v IS NOT NULL THEN RAISE EXCEPTION 'proof failed: expected NULL jsonb for an impossible code'; END IF;
  SELECT has_function_privilege('anon', 'public.receipt_for_code(text)', 'EXECUTE') INTO ok;
  IF NOT ok THEN RAISE EXCEPTION 'proof failed: anon lost EXECUTE'; END IF;
END $$;

COMMIT;
