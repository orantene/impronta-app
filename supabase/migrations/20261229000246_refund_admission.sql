-- Refunding one admission: stamp AND release, as ONE operation.
--
-- Sessions surfaced the reason and it is not obvious: `release_capacity` does
-- not touch `admissions` (verified — its definition never mentions the table),
-- and `check_in` admits whenever `status = 'valid'`. So releasing a seat WITHOUT
-- stamping the row leaves a refunded ticket that still admits, while the seat
-- has already been resold.
--
-- That is an oversell no reconciler can see: the row count is right, the
-- allocation count is right, and the ONLY thing wrong is a status. It surfaces
-- as two people holding one seat at a door.
--
-- Two separate calls cannot fix it, because either can fail alone. So both
-- writes happen here, under one `FOR UPDATE` on the admission — the same lock
-- discipline `check_in` uses, against the same row.

CREATE OR REPLACE FUNCTION public.refund_admission(p_admission_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.admissions%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.admissions WHERE id = p_admission_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unknown_admission');
  END IF;

  -- Idempotent by IDENTITY, like the release it wraps. A retried webhook or a
  -- double-clicked refund must not be a second refund, and must not report a
  -- failure for work already done.
  IF r.status = 'refunded' THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;

  -- Someone who walked in and then wants money back is a DISPUTE, not a
  -- refund-by-line. Refused here as well as in the selector, because the
  -- selector reads rows that could change before this runs and this is the
  -- decision made under the lock.
  IF r.admitted_count > 0 THEN
    RETURN jsonb_build_object(
      'ok', false, 'reason', 'already_admitted',
      'admittedCount', r.admitted_count
    );
  END IF;

  IF r.status <> 'valid' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_valid', 'status', r.status);
  END IF;

  -- THE STAMP. `check_in` gates on `status <> 'valid'` and returns `not_valid`
  -- WITH the status, so a door reads one row and says "refunded" rather than
  -- the unhelpful "invalid".
  UPDATE public.admissions
     SET status = 'refunded', updated_at = now()
   WHERE id = p_admission_id;

  -- THE RELEASE, in the same transaction as the stamp. Under the per-admission
  -- allocation shape this is exactly one seat — the reason Capacity refused a
  -- quantity-based release, since a decrement called twice frees a seat still
  -- in someone's pocket while release-by-identity is a no-op the second time.
  --
  -- An admission with no allocation is legitimate (a cash door sale that never
  -- reserved), so a NULL is skipped rather than treated as an error.
  IF r.allocation_id IS NOT NULL THEN
    PERFORM public.release_capacity(ARRAY[r.allocation_id]);
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'already', false,
    'releasedAllocation', r.allocation_id IS NOT NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.refund_admission(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_admission(UUID) TO service_role;

-- Assert the revoke took. `FROM PUBLIC` alone did NOT remove anon's grant on an
-- earlier function this phase: Supabase grants anon and authenticated
-- explicitly, and revoking the PUBLIC pseudo-role leaves a named grant intact.
DO $check$
BEGIN
  IF has_function_privilege('anon', 'public.refund_admission(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.refund_admission(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'refund_admission is executable by anon/authenticated; the REVOKE did not take';
  END IF;
END
$check$;

COMMENT ON FUNCTION public.refund_admission(UUID) IS
  'Stamps an admission refunded AND releases its seat, atomically. Two calls '
  'cannot do this: if the release lands and the stamp does not, the seat is '
  'resold while the original ticket still admits.';
