-- `refund_admission` must accept a VOID admission, not only a valid one.
--
-- THE INTERACTION THIS CLOSES. `cancel_event_cascade` (20261230000800) stamps
-- every valid admission of a cancelled event `'void'` immediately, so the door
-- stops admitting the moment the venue cancels rather than whenever the refund
-- cron next runs. It then records a `ticket_refund_intents` row per unrefunded
-- paid line, and the cron executes those through `refundOrderLines`, which
-- calls this function per admission.
--
-- Which arrived at a row this function refused. `status <> 'valid'` returned
-- `not_valid`, so:
--
--   * the admission stayed `'void'` for ever and never reached `'refunded'`,
--     so the door said "cancelled" to a person whose money we HAD returned,
--     and no read anywhere could distinguish "we cancelled and paid you back"
--     from "we cancelled and kept it";
--   * `release_capacity` was never called for the allocation, so the seat
--     stayed committed. Deactivating the pool hides that while the pool is
--     off — reactivate the event (a postponement that comes back on) and the
--     tier is full of seats belonging to refunded tickets.
--
-- The second one is the real cost. Allocations are released by IDENTITY here
-- precisely so nobody has to reconcile a count later; skipping the release
-- creates exactly the orphan the identity discipline exists to avoid.
--
--
-- WHY WIDEN THIS RATHER THAN STOP VOIDING IN THE CASCADE
-- ═════════════════════════════════════════════════════
-- The alternative was to leave admissions `'valid'` at cancellation and let the
-- refund executor be the only writer. It was refused: it makes the door keep
-- admitting to a cancelled show until a cron runs, and it never touches comp or
-- otherwise-unpaid admissions at all, because those generate no refund intent
-- and so no executor call. A cancelled event with a guest list would admit the
-- guest list. The door must close at the moment of the decision; the money
-- follows on its own clock.
--
-- WHY THE WIDENING IS NARROW. `'void'` has exactly one writer in this schema —
-- `cancel_event_cascade` — verified across every migration and every
-- application path. So `void -> refunded` is not a general loosening of the
-- state machine; it is naming the one transition that already exists. Every
-- other refusal is untouched, and in particular the `admitted_count > 0` guard
-- still runs FIRST: somebody who walked in before the show was called off is
-- still a dispute, not a refund-by-line, whatever their row now says.
--
-- Idempotency is unchanged and still by identity: `'refunded'` short-circuits
-- to `ok, already`, so the cron's claim-then-execute guard and this function
-- agree about what a second run means.

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
  -- decision made under the lock. Deliberately BEFORE the status gate: a
  -- cancelled event voids attended rows too, and this must still answer
  -- `already_admitted` for them rather than quietly refunding a night that
  -- somebody was let into.
  IF r.admitted_count > 0 THEN
    RETURN jsonb_build_object(
      'ok', false, 'reason', 'already_admitted',
      'admittedCount', r.admitted_count
    );
  END IF;

  IF r.status NOT IN ('valid', 'void') THEN
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
    'fromStatus', r.status,
    'releasedAllocation', r.allocation_id IS NOT NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.refund_admission(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_admission(UUID) TO service_role;

-- Re-asserted after CREATE OR REPLACE. Replacing a function keeps its ACL, so
-- this should hold without the REVOKE above — but an earlier function this
-- phase proved that assumption wrong in the other direction, and a silent
-- widening of who may refund a ticket is not a thing to leave to belief.
DO $check$
BEGIN
  IF has_function_privilege('anon', 'public.refund_admission(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.refund_admission(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'refund_admission is executable by anon/authenticated; the REVOKE did not take';
  END IF;
END
$check$;

COMMENT ON FUNCTION public.refund_admission(UUID) IS
  'Stamps an admission refunded AND releases its seat, atomically, from either a valid or a void '
  'starting state. Two calls cannot do this: if the release lands and the stamp does not, the seat '
  'is resold while the original ticket still admits. Void is accepted because cancel_event_cascade '
  'closes the door first and the money follows on the refund cron''s clock.';
