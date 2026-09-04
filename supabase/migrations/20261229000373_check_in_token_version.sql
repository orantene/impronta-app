-- Phase 2 · E8 — `check_in` refuses a superseded token.
--
-- THE GAP, found by the Sessions & Classes Manager while dry-running a second
-- `check_in` of their own (which Postgres would have created as an OVERLOAD
-- rather than a replacement, because a function is identified by name AND
-- argument types -- worse than clobbering, because clobbering is visible).
--
-- `token_version` exists so a transfer or a re-issue can kill the old QR while
-- keeping the seat, and it is bound INSIDE the HMAC so a downgraded token
-- cannot be forged. But a GENUINE token for a superseded version still
-- verifies -- correctly, because the signature is over identity -- and nothing
-- compared it to the row. Measured on main: zero callers of `check_in`, and
-- zero code anywhere comparing `token_version` to a row.
--
-- SO A TRANSFERRED TICKET ADMITTED BOTH PEOPLE. The re-issue guarantee existed
-- in the column and nowhere else.
--
-- IT BELONGS HERE AND NOT IN A CALLER, because this function already holds the
-- row lock, so the comparison is atomic with the write. In a caller the
-- guarantee is one person's memory away from being dropped, and the caller that
-- forgets still compiles, still passes, and still admits.
--
-- WHY AN EXPLICIT MODE RATHER THAN `p_token_version DEFAULT NULL` ALONE, which
-- is what I was offered. A nullable version that is simply skipped when absent
-- makes the check OPT-OUT BY OMISSION: a door caller that forgets the argument
-- gets no check, no error, and admits a superseded ticket. That is the same
-- "an absent value is not a value" hazard this area has now hit four times.
--
-- `p_mode` makes the caller STATE which door it is. A caller claiming 'token'
-- must present a version or be refused; a host stand says 'actor' and no token
-- is involved. The wrong call becomes unconstructable rather than merely
-- discouraged. There are ZERO callers on main today, so this is the cheapest
-- moment this shape will ever be changed.
--
-- TENANT: this function still takes no tenant and does no tenant check. It is
-- service-role EXECUTE only and the app layer scopes the id. Stated in the
-- header rather than left implicit: a caller that passes an admission id it did
-- not itself scope WILL check in another tenant's guest.

BEGIN;

DROP FUNCTION IF EXISTS public.check_in(uuid, int, uuid);

CREATE OR REPLACE FUNCTION public.check_in(
  p_admission_id uuid,
  p_count int DEFAULT NULL,
  p_actor uuid DEFAULT NULL,
  -- The `<n>` from a verified `admission:v<n>:<id>` token. Required when
  -- p_mode = 'token'; ignored otherwise.
  p_token_version int DEFAULT NULL,
  -- 'token' = a door that verified a QR. 'actor' = a host stand that tapped a
  -- row. The caller states it; the function does not infer it from an absence.
  p_mode text DEFAULT 'actor'
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

  -- A caller that says it verified a token must show which version it verified.
  -- Refusing here is the whole point: silence would be an unchecked admission.
  IF p_mode = 'token' AND p_token_version IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'token_version_required');
  END IF;

  -- The lock IS the correctness. Two staff scanning one QR at the same instant
  -- serialise here; the second sees the first's write and is refused.
  SELECT * INTO r FROM public.admissions WHERE id = p_admission_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unknown_admission');
  END IF;

  -- Checked under the lock, against the ROW, which is the only authority. A
  -- genuine older token verifies its own signature perfectly; only the row
  -- knows it has been superseded.
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
  -- passes `3 <= party_size` and overfills the row.
  IF v_count > v_remaining THEN
    RETURN jsonb_build_object(
      'ok', false, 'reason', 'exceeds_remaining',
      'remaining', v_remaining, 'requested', v_count
    );
  END IF;

  UPDATE public.admissions
     SET admitted_count = admitted_count + v_count,
         -- First arrival only: the turn runs from when the first of them sat.
         seated_at = COALESCE(seated_at, now())
         -- `no_show_at` is NOT cleared: it is evidence for a fee that may
         -- already have been charged.
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

REVOKE ALL ON FUNCTION public.check_in(uuid, int, uuid, int, text) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.check_in(uuid, int, uuid, int, text) IS
  'Admit people to an admission that already exists. p_mode states the caller: "token" (a door that '
  'verified a QR, and MUST present the token version it verified) or "actor" (a host stand that '
  'tapped a row). The version is compared to the row UNDER THE LOCK, because a genuine older token '
  'verifies its own signature perfectly and only the row knows it was superseded — without this a '
  'transferred ticket admits both people. Owns the COUNT arithmetic and the version comparison; '
  'signature verification stays in the app because the token format is Sessions''. Service-role '
  'EXECUTE only: it takes NO tenant and does NO tenant check, so a caller that passes an admission '
  'id it did not itself scope will check in another tenant''s guest.';

COMMIT;
