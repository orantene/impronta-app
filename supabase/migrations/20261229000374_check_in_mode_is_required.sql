-- Phase 2 · E8 — `p_mode` is REQUIRED. The default failed open.
--
-- `20261229000373` added `p_mode text DEFAULT 'actor'` so a caller would have
-- to state which door it is, precisely so an omitted `p_token_version` could
-- not silently skip the version check. The Reservations Manager pointed out
-- that THE DEFAULT REINTRODUCES THE SAME SILENCE ONE LEVEL UP, and they are
-- right.
--
-- A door caller that forgets the argument does not get `token_version_required`.
-- It gets `'actor'`, and BOTH the version-required refusal and the
-- `token_superseded` refusal are skipped. The omission silently disables the
-- control the previous migration exists to add, and IT FAILS OPEN: a superseded
-- ticket admits.
--
-- My own comment in that file says it: "Refusing here is the whole point:
-- silence would be an unchecked admission." True inside the function; the
-- default put the silence back at the call site.
--
-- THE COLLAPSE IS THE POINT. "The caller said nothing" and "the caller is a
-- host stand" became ONE VALUE, so no later code can tell them apart — the
-- same reason a read that returns `[]` on error can never be recovered
-- downstream. Absence must be structurally distinct from a value. It is now:
-- a caller that omits the mode gets a hard "function does not exist" rather
-- than a quiet bypass.
--
-- WHY THE ORDER CHANGES. Postgres requires that every parameter after one with
-- a default also has a default, so `p_mode` cannot stay last and lose its
-- default. It moves to second: the two things a caller must always know are
-- WHICH ADMISSION and BY WHAT AUTHORITY, and everything optional follows.
--
-- AND THE ARGUMENT TYPES CHANGE AGAIN, so `CREATE OR REPLACE` alone would leave
-- the 5-arg version standing beside the new one — the overload hazard, for the
-- second time in two migrations on this function. The old signature is dropped
-- explicitly and the count is verified afterwards.
--
-- Safe to do at all only because there are ZERO callers: measured on main,
-- `rpc("check_in")` appears nowhere in web/src. Every mention is a comment.
-- This is the last moment this is free.

BEGIN;

DROP FUNCTION IF EXISTS public.check_in(uuid, int, uuid, int, text);

CREATE OR REPLACE FUNCTION public.check_in(
  p_admission_id uuid,
  -- REQUIRED, and deliberately not defaulted. 'token' = a door that verified a
  -- QR and must present the version it verified. 'actor' = a host stand that
  -- tapped a row; no token exists.
  p_mode text,
  p_count int DEFAULT NULL,
  p_actor uuid DEFAULT NULL,
  p_token_version int DEFAULT NULL
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
  IF p_mode IS NULL OR p_mode NOT IN ('token', 'actor') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_mode');
  END IF;

  IF p_mode = 'token' AND p_token_version IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'token_version_required');
  END IF;

  -- The lock IS the correctness. Two staff scanning one QR at the same instant
  -- serialise here; the second sees the first's write and is refused.
  SELECT * INTO r FROM public.admissions WHERE id = p_admission_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unknown_admission');
  END IF;

  -- Under the lock, against the ROW. A genuine older token verifies its own
  -- signature perfectly; only the row knows it has been superseded.
  IF p_mode = 'token' AND r.token_version IS DISTINCT FROM p_token_version THEN
    RETURN jsonb_build_object(
      'ok', false, 'reason', 'token_superseded',
      'presented', p_token_version, 'current', r.token_version
    );
  END IF;

  IF r.status <> 'valid' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_valid', 'status', r.status);
  END IF;

  v_remaining := r.party_size - r.admitted_count;

  IF v_remaining <= 0 THEN
    RETURN jsonb_build_object(
      'ok', false, 'reason', 'already_admitted',
      'partySize', r.party_size, 'admittedCount', r.admitted_count, 'at', r.seated_at
    );
  END IF;

  v_count := COALESCE(p_count, v_remaining);

  IF v_count <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_count');
  END IF;

  -- Against the REMAINDER, not party_size: 2 of 4 seated and "seat 3 more"
  -- passes `3 <= party_size` and overfills the row. (Reservations' case.)
  IF v_count > v_remaining THEN
    RETURN jsonb_build_object(
      'ok', false, 'reason', 'exceeds_remaining',
      'remaining', v_remaining, 'requested', v_count
    );
  END IF;

  UPDATE public.admissions
     SET admitted_count = admitted_count + v_count,
         seated_at = COALESCE(seated_at, now())
         -- `no_show_at` is NOT cleared: evidence for a fee that may already
         -- have been charged. (Reservations' argument.)
   WHERE id = r.id;

  RETURN jsonb_build_object(
    'ok', true,
    'admitted', v_count,
    'admittedCount', r.admitted_count + v_count,
    'partySize', r.party_size,
    'remaining', v_remaining - v_count,
    'wasMarkedNoShow', r.no_show_at IS NOT NULL,
    'actor', p_actor
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_in(uuid, text, int, uuid, int) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.check_in(uuid, text, int, uuid, int) IS
  'Admit people to an admission that already exists. p_mode is REQUIRED and has no default: "token" '
  '(a door that verified a QR, and MUST present the version it verified) or "actor" (a host stand '
  'that tapped a row). A default would let a forgetful door caller land on "actor" and skip the '
  'version check entirely — failing OPEN on an omission, which is the failure this parameter exists '
  'to prevent. Service-role EXECUTE only: it takes NO tenant and does NO tenant check, so a caller '
  'that passes an admission id it did not itself scope will check in another tenant''s guest.';

COMMIT;
