-- Security hardening (TUL-1013 re-audit), 2026-10-18. APPLIED to production (earlier, by the DB owner) and to staging fxlank 2026-10-18 (Oran: full migration permission). Idempotent.
-- Additive hardening; safe before or after the code merges (no code path depends on the grants removed).
--
-- Staging (fxlank, read-only check) showed anon can EXECUTE 26 SECURITY DEFINER functions in
-- public. 9 are on PUBLIC_SURFACE_FUNCTIONS. Of the other 17, this file closes the 9
-- signatures below and the remaining 9 are RLS policy helpers that anon policies evaluate
-- (revoking those would turn every logged-out read of the table into "permission denied
-- for function"); they are recorded in POLICY_HELPER_FUNCTIONS with the evidence.
--
-- Closed here (REVOKE EXECUTE FROM PUBLIC, anon; keep authenticated + service_role):
--   capacity_remaining_public      every web/src caller uses the service-role client; the only
--                                  DB callers are the session-waitlist functions (staff / DEFINER)
--   guide_article_signal           volatile writer; body requires auth.uid() and raises; no policy,
--   guide_search_miss              view or function references either
--   is_booking_coordinator         policy helpers whose policies are all TO authenticated
--   is_inquiry_coordinator         (0 anon-applicable policies on staging)
--   is_super_admin                 same: 16 policies, none applies to anon
--   merge_guest_session_to_client  both overloads; volatile writer; body requires auth.uid() and
--                                  raises; callers (onboarding, client-guest-merge) hold a session
--   resolve_public_tenant_by_slug  callers (review-actions, review-request-actions, testimonial-actions) all
--                                  run on a signed-in client/talent/staff session, which keeps EXECUTE; no policy
-- Pinned by web/src/lib/saas/sec-definer-anon-revoke-no-public-surface.static.test.ts.

DO $$
DECLARE
  fn text;
  r record;
  n int := 0;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'capacity_remaining_public',
    'guide_article_signal',
    'guide_search_miss',
    'is_booking_coordinator',
    'is_inquiry_coordinator',
    'is_super_admin',
    'merge_guest_session_to_client',
    'resolve_public_tenant_by_slug'
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
  -- 8 names, 9 signatures (merge_guest_session_to_client has two overloads).
  IF n < 9 THEN
    RAISE EXCEPTION 'assertion failed: expected >= 9 definer function signatures, found %', n;
  END IF;
END $$;
