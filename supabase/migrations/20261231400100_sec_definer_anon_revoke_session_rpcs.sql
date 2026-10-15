-- Security hardening (C1 batch, TUL-1013 follow-up), 2026-10-14.
-- Follow-up to 20261231390200. Prod security advisor (2026-10-14) still lists
-- these SECURITY DEFINER RPCs as executable by anon. Each one acts on
-- auth.uid() (onboarding completion, profile ensure, claim, mark-read), every
-- web/src caller holds a signed-in session (callers redirect to /login first),
-- and no policy, view or function references them (prod pg_policies check).
--   REVOKE EXECUTE FROM PUBLIC, anon; keep authenticated + service_role.
-- Not applied: PM applies after merge (safe early: yes, additive hardening).
-- Pinned by web/src/lib/saas/sec-definer-anon-revoke-session-rpcs.static.test.ts.

DO $$
DECLARE
  fn text;
  r record;
  n int := 0;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'claim_talent_profile',
    'complete_client_onboarding',
    'complete_talent_onboarding',
    'complete_talent_onboarding_with_locations',
    'ensure_profile_for_current_user',
    'inquiry_mark_thread_read',
    'user_notifications_mark_all_read',
    'user_notifications_mark_read'
  ] LOOP
    FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p
             JOIN pg_namespace ns ON ns.oid = p.pronamespace
             WHERE ns.nspname = 'public' AND p.proname = fn AND p.prosecdef LOOP
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.sig);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
      IF has_function_privilege('anon', r.sig, 'EXECUTE') THEN
        RAISE EXCEPTION 'assertion failed: % still executable by anon', r.sig;
      END IF;
      IF NOT has_function_privilege('authenticated', r.sig, 'EXECUTE') THEN
        RAISE EXCEPTION 'assertion failed: % lost authenticated EXECUTE', r.sig;
      END IF;
      n := n + 1;
    END LOOP;
  END LOOP;
  IF n < 8 THEN
    RAISE EXCEPTION 'assertion failed: expected >= 8 definer functions, found %', n;
  END IF;
END $$;
