-- TUL-486: generate_profile_code() overflow guard.
--
-- Two ways the old body broke EVERY signup:
--   1. `lpad(n::text, 5, '0')` TRUNCATES when n has more than 5 digits
--      (lpad('22840680', 5, '0') = '22840'), so one odd fixture code
--      (TAL-22840680, fxlank 2026-10-09) made MAX+1 return an 8-digit number that
--      was cut to TAL-22840 and collided with an existing row, forever; and the
--      same thing happens for everyone at TAL-100000 (production max is
--      TAL-93947, so ~6,000 codes of headroom).
--   2. MAX+1 let a single outlier drag the counter up for good, and the INT
--      cast overflows past 2^31.
--
-- Now: the format grows (5 digits minimum, never truncated), the counter
-- ignores outliers of 7+ digits when self-healing, arithmetic is bigint, and a
-- candidate that already exists is skipped (bounded loop). Signature, security
-- attributes and grants are unchanged (CREATE OR REPLACE keeps the service_role
-- only EXECUTE from 20260906031100).

BEGIN;

CREATE OR REPLACE FUNCTION public.generate_profile_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max   BIGINT;
  v_next  BIGINT;
  v_code  TEXT;
  v_tries INT := 0;
BEGIN
  -- Highest sane TAL-<1..6 digits> already used. Codes of 7+ digits are
  -- outliers (fixtures) and must not drag the counter; custom-suffixed codes
  -- (TAL-AUDIT-0512) never match.
  SELECT COALESCE(MAX((substring(profile_code from '^TAL-(\d{1,6})$'))::bigint), 0)
    INTO v_max
    FROM public.talent_profiles
    WHERE profile_code ~ '^TAL-\d{1,6}$';

  v_next := GREATEST(nextval('public.talent_profile_code_seq')::bigint, v_max + 1);

  LOOP
    -- Five digits minimum, never truncated: lpad cuts longer strings.
    v_code := 'TAL-' || CASE WHEN v_next < 100000 THEN lpad(v_next::text, 5, '0') ELSE v_next::text END;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.talent_profiles WHERE profile_code = v_code);
    v_tries := v_tries + 1;
    IF v_tries > 1000 THEN
      RAISE EXCEPTION 'generate_profile_code: no free code after % tries (last %)', v_tries, v_code;
    END IF;
    v_next := v_next + 1;
  END LOOP;

  PERFORM setval('public.talent_profile_code_seq', v_next);
  RETURN v_code;
END;
$$;

COMMENT ON FUNCTION public.generate_profile_code() IS
  'Next free numeric TAL code. 5-digit minimum, grows past TAL-99999, never truncates; ignores 7+ digit outliers when self-healing; skips existing codes.';

COMMIT;
