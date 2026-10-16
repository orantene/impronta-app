-- Security hardening (integ/now-sec-rls2), 2026-10-14. Follow-up to
-- 20261231390100 (uncalled definer RPCs). Self-contained.
--
-- These SECURITY DEFINER RPCs have .rpc() callers in web/src, but every caller
-- is either the service-role client or a signed-in session client (workspace
-- admin, client and talent server actions, site-admin, domain settings). The
-- logged-out /contact and /directory inquiry paths call submitInquiry with
-- createServiceRoleClient, never the anon key. No policy, view or other
-- function references them (prod, 2026-10-14). So:
--   REVOKE EXECUTE FROM PUBLIC, anon; keep authenticated + service_role.
-- Pinned by web/src/lib/saas/sec-definer-anon-revoke-signed-in.static.test.ts.

DO $$
DECLARE
  fn text;
  r record;
  n int := 0;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'engine_add_requirement_group',
    'engine_add_secondary_coordinator',
    'engine_assign_participant_to_group',
    'engine_convert_to_booking',
    'engine_promote_to_primary',
    'engine_remove_requirement_group',
    'engine_remove_secondary_coordinator',
    'engine_update_requirement_group',
    'inquiry_audit_emit',
    'inquiry_audit_emit_field',
    'record_phase5_audit',
    'set_primary_agency_domain'
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
  IF n < 12 THEN
    RAISE EXCEPTION 'assertion failed: expected >= 12 definer functions, found %', n;
  END IF;
END $$;
