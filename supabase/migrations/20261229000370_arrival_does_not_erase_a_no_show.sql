-- Phase 2 · E8 — arrival must NOT clear `no_show_at`.
--
-- `20261229000369` shipped `check_in` setting `no_show_at = NULL` on arrival,
-- reasoning that someone had decided a guest was not coming and had been wrong,
-- so the row must not say both. That reasoning was mine and it is wrong, and the
-- Reservations Manager caught it by reading the function against their five host
-- stand actions rather than nodding at the signature.
--
-- A NO-SHOW FEE IS CHARGED OFF THAT STAMP. Null it when the guest walks in and
-- the row shows somebody seated AND charged a penalty, with nothing on it saying
-- why. The guest disputes the charge -- correctly, from where they are standing
-- -- and THE RECORD CANNOT ANSWER.
--
-- `no_show_at` is not a status. It is the EVIDENCE FOR A CHARGE THAT ALREADY
-- HAPPENED, and evidence does not get retracted because the situation improved.
-- The stamp stays; the DISPLAY prefers arrival. Reservations' `bookState` now
-- tests arrival before the stamp, which is a rendering decision made where
-- rendering decisions belong.
--
-- WHAT I ACTUALLY GOT WRONG, because it is subtler than "do not delete data".
-- Reservations' own prior rule is that terminal states are tested FIRST, so a
-- stamped row cannot drift back into a live one -- a no-show at 20:00 must not
-- read "late by 180 minutes" at 23:00. I applied that ordering to arrival too.
-- It holds for `late` and NOT for arrival, and the difference is the whole
-- lesson: `late` is derived from a CLOCK, and a clock moving is not new
-- information. Arrival is a HUMAN ACT RECORDED AFTER THE STAMP. Somebody walking
-- in genuinely is new information, and a display that ignores it to protect an
-- ordering rule is protecting the rule instead of the room.
--
-- A NEW MIGRATION RATHER THAN AN EDIT TO 20261229000369, which has already run
-- against production. A migration file and the database it produced must not
-- disagree, and the history should show that production carried the wrong
-- behaviour for a window rather than quietly reading as though it never did.

BEGIN;

CREATE OR REPLACE FUNCTION public.check_in(
  p_admission_id uuid,
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

  -- Carries the status, so a door says "refunded" rather than "invalid".
  IF r.status <> 'valid' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_valid', 'status', r.status);
  END IF;

  v_remaining := r.party_size - r.admitted_count;

  -- With p_count defaulting to the remainder, a second scan would admit ZERO,
  -- violate nothing and RETURN SUCCESS: a green door for someone already inside,
  -- and at a host stand a free four-top the room does not have.
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

  -- Against the REMAINDER, not party_size: 2 of 4 seated and "seat 3 more"
  -- passes `3 <= party_size` and overfills the row.
  IF v_count > v_remaining THEN
    RETURN jsonb_build_object(
      'ok', false, 'reason', 'exceeds_remaining',
      'remaining', v_remaining, 'requested', v_count
    );
  END IF;

  UPDATE public.admissions
     SET admitted_count = admitted_count + v_count,
         -- First arrival only: a party arriving in two goes was seated when the
         -- first of them sat, the turn runs from then, and the next party's slot
         -- is computed off it. Last arrival would hand a late party a free
         -- extension nobody granted.
         seated_at = COALESCE(seated_at, now())
         -- `no_show_at` IS DELIBERATELY NOT TOUCHED. See the header: it is the
         -- evidence for a fee that may already have been charged.
   WHERE id = r.id;

  RETURN jsonb_build_object(
    'ok', true,
    'admitted', v_count,
    'admittedCount', r.admitted_count + v_count,
    'partySize', r.party_size,
    'remaining', v_remaining - v_count,
    -- Told to the caller rather than silently resolved, so a door or a host
    -- stand can say "this guest was marked a no-show and has now arrived" --
    -- which is the sentence somebody needs when a fee is on the bill.
    'wasMarkedNoShow', r.no_show_at IS NOT NULL,
    'actor', p_actor
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_in(uuid, int, uuid) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.check_in(uuid, int, uuid) IS
  'Admit people to an admission that already exists. Two entry modes by caller: a door verifies a QR '
  'token and passes the id; a host stand passes the id it tapped, with a count. Owns the COUNT '
  'arithmetic only -- token verification is the app''s, because the format belongs to Sessions. '
  'Does NOT clear no_show_at: that stamp is evidence for a fee that may already have been charged, '
  'and the display prefers arrival instead. Never granted to authenticated: it is SECURITY DEFINER, '
  'so that would let any signed-in person admit any admission across any tenant -- the app layer is '
  'the boundary, exactly as it is for platform-account payment methods.';

COMMIT;
