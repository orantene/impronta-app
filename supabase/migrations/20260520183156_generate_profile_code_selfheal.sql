-- generate_profile_code: make collision-proof against seeded codes.
--
-- The original RPC used `nextval('talent_profile_code_seq')` and returned
-- 'TAL-' || lpad(N, 5, '0'). The sequence is never advanced when rows are
-- inserted with explicit `profile_code` values (seed data, manual repair,
-- imports), so once the sequence falls behind the highest existing code the
-- RPC starts handing out duplicates that fail the `talent_profiles_profile_code_key`
-- UNIQUE constraint. Reproduced 2026-05-20 on the QA Impronta workspace where
-- seeded codes ran past TAL-00047 but the sequence was still at TAL-00033.
--
-- This redefinition computes the next free code as MAX(existing TAL-NNNNN) + 1
-- on every call, and keeps the sequence aligned via `setval` so subsequent
-- calls remain O(1) in the happy path. The MAX scan is index-friendly
-- (talent_profiles_profile_code_key is a unique btree on profile_code).
--
-- Idempotent: replacing the function body has no schema-level side effects.

BEGIN;

CREATE OR REPLACE FUNCTION public.generate_profile_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max  INT;
  v_next INT;
BEGIN
  -- Highest TAL-NNNNN already used. Ignores custom-suffixed codes
  -- (e.g. TAL-AUDIT-0512) so they don't poison the counter.
  SELECT COALESCE(MAX((substring(profile_code from '^TAL-(\d+)$'))::int), 0)
    INTO v_max
    FROM public.talent_profiles
    WHERE profile_code ~ '^TAL-\d+$';

  -- Next free integer: max(seq_next, used_max + 1). Pin the sequence so
  -- the next call is fast without a re-scan in the no-collision case.
  v_next := GREATEST(nextval('public.talent_profile_code_seq')::int, v_max + 1);
  PERFORM setval('public.talent_profile_code_seq', v_next);

  RETURN 'TAL-' || lpad(v_next::text, 5, '0');
END;
$$;

COMMIT;
