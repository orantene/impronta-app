-- Phase 2 · E8 — `check_in`: one enforcement site, two ways in.
--
-- Agreed with the Reservations Manager BEFORE it was written, which is the only
-- reason it has two entry modes instead of one.
--
-- WHY NOT TOKEN-ONLY. A diner scans nothing. The host taps "Seat" beside a name,
-- and for a walk-in there is no booking, no receipt and NO TOKEN IN EXISTENCE.
-- A token-only signature leaves the host stand either minting a token nobody
-- will ever scan, or writing `admitted_count` directly and becoming a SECOND
-- implementation of this arithmetic. So: one function, and the caller has
-- already resolved WHICH admission -- by verifying a QR token, or by a host
-- tapping a row.
--
-- THE SPLIT, AND WHY THE TOKEN IS NOT VERIFIED IN HERE. The token format is
-- Sessions & Classes' -- an HMAC over `admission:v<n>:<id>` with `token_version`
-- as the <n>. Verifying it in SQL would be a second implementation of THEIR
-- rule, which is the exact duplication this function exists to avoid one layer
-- down. The app verifies the token and passes the admission id; this function
-- owns the COUNT arithmetic and nothing else. Two rules, two owners, one site
-- each.
--
-- WHY IT IS SQL AND NOT TYPESCRIPT. The row lock is the correctness. Two door
-- staff scanning the same QR at the same instant is not hypothetical at a door,
-- and `FOR UPDATE` is what makes the second one lose. A TypeScript check would
-- read, decide, and write with a gap in the middle.
--
-- SERVICE ROLE ONLY, DELIBERATELY. A SECURITY DEFINER function bypasses RLS, so
-- granting it to `authenticated` would let any signed-in person check in any
-- admission whose uuid they could obtain. The door route authenticates its staff
-- member in the app layer and calls this with the service role. That is the V-6
-- decision -- no `door` membership role, because `is_staff_of_tenant` never
-- reads `role` and adding one would hand a door person RLS on clients, revenue
-- and messages.

BEGIN;

CREATE OR REPLACE FUNCTION public.check_in(
  p_admission_id uuid,
  -- NULL means "the remainder": one scan admits a whole party, which is what a
  -- VIP table for six needs. A host seating two of a four-top passes 2.
  p_count int DEFAULT NULL,
  p_actor uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r public.admissions%ROWTYPE;
  v_remaining int;
  v_count int;
BEGIN
  -- The lock IS the correctness. Two staff scanning one QR at the same instant
  -- serialise here; the second sees the first's write and is refused.
  SELECT * INTO r FROM public.admissions WHERE id = p_admission_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unknown_admission');
  END IF;

  -- Carries the status, so a door says "refunded" rather than "invalid". The
  -- DoorScanner shows a reason, and "invalid" to someone holding a ticket they
  -- paid for starts an argument that the real reason ends.
  IF r.status <> 'valid' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_valid', 'status', r.status);
  END IF;

  v_remaining := r.party_size - r.admitted_count;

  -- THE TRAP THE DEFAULT CREATES, CLOSED HERE. With `p_count` defaulting to the
  -- remainder, a second scan would admit ZERO, violate nothing, and RETURN
  -- SUCCESS -- a green door for someone already inside. Worse at a host stand:
  -- "seated" for a party already at a table means the host believes the room has
  -- a free four-top it does not have, and the next booking is refused or
  -- double-seated. The bug is not a wrong badge, it is a wrong floor.
  IF v_remaining <= 0 THEN
    RETURN jsonb_build_object(
      'ok', false, 'reason', 'already_admitted',
      'partySize', r.party_size, 'admittedCount', r.admitted_count,
      'at', r.seated_at
    );
  END IF;

  v_count := COALESCE(p_count, v_remaining);

  IF v_count <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_count');
  END IF;

  -- CHECKED AGAINST THE REMAINDER, NOT `party_size`. Reservations' case: 2 of 4
  -- seated, host taps "seat 3 more". `3 <= party_size` passes and overfills the
  -- row; `3 > remaining` is the refusal that stops a five-top being recorded
  -- against a four-top.
  IF v_count > v_remaining THEN
    RETURN jsonb_build_object(
      'ok', false, 'reason', 'exceeds_remaining',
      'remaining', v_remaining, 'requested', v_count
    );
  END IF;

  UPDATE public.admissions
     SET admitted_count = admitted_count + v_count,
         -- First arrival only. A party arriving in two goes was seated when the
         -- first of them walked in, not when the last did.
         seated_at = COALESCE(seated_at, now()),
         -- Arriving clears a no-show call: somebody decided they were not coming
         -- and was wrong, and the row must not say both.
         no_show_at = NULL
   WHERE id = r.id;

  RETURN jsonb_build_object(
    'ok', true,
    'admitted', v_count,
    'admittedCount', r.admitted_count + v_count,
    'partySize', r.party_size,
    'remaining', v_remaining - v_count,
    'actor', p_actor
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_in(uuid, int, uuid) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.check_in(uuid, int, uuid) IS
  'Admit people to an admission that already exists. TWO ENTRY MODES by caller: a door verifies a QR '
  'token and passes the id; a host stand passes the id it tapped, with a count. Owns the COUNT '
  'arithmetic only -- token verification is the app''s, because the token format belongs to Sessions '
  'and a second implementation here is the duplication this function exists to prevent. Never granted '
  'to authenticated: it is SECURITY DEFINER, so that would let any signed-in person admit any '
  'admission. It does NOT create walk-ins -- creating the row is Reservations''; this admits people to '
  'rows that exist.';

COMMIT;
