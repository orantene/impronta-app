-- TUL-1748 — HELD (PM applies, after 20261231424500). Do not db push / apply by hand.
--
-- ONE shared answer to "is this a direct database connection?", used by the two SECURITY DEFINER
-- gates that admit internal callers:
--   * public.agencies_guard_commercial_terms()            (20261231424500, TUL-1311)
--   * public.engine_caller_may_write_tenant_finances(uuid) (20261226000011)
--
-- WHAT WAS WRONG. Both treated an EMPTY jwt role (request.jwt.claims / request.jwt.claim.role unset)
-- as "an internal / direct connection" and admitted it. That is also true of any request whose claims
-- GUC is simply not set. It is not exploitable today (the gateway always sends a role, and anon fails
-- RLS first), but "no claim" is the wrong evidence for "trusted caller".
--
-- THE ROBUST TEST. PostgREST (the API) always connects as the login role `authenticator`, then
-- switches role per request. Migrations, the SQL editor, psql through the pooler and pg_cron connect
-- as another login role (postgres and friends). `session_user` is the LOGIN role: it is not changed
-- by SET ROLE and not by SECURITY DEFINER (unlike current_user), so inside a definer function
--     session_user <> 'authenticator'
-- is true exactly for a direct connection and false for every API request.
--
-- service_role requests still come through the API, so they are still admitted by their verified
-- JWT role claim, exactly as before. Only the "empty role means direct" shortcut goes away.
--
-- Both functions are re-created WHOLE (CREATE OR REPLACE keeps the ACL; the revokes and grants are
-- restated). This file must apply AFTER 20261231424500, which creates the commercial-terms trigger
-- function this replaces; its version (…4700) orders it there. Additive and idempotent.
--
-- GRANTS (20261231415700 is on fxlank: new functions start with no EXECUTE for anon/authenticated):
-- the helper is called only from the two SECURITY DEFINER functions below, which run as the owner,
-- so it is granted explicitly to service_role and nobody else. It is NOT granted to authenticated,
-- so it needs no function-execute-allowlist entry.

CREATE OR REPLACE FUNCTION public.caller_is_direct_connection()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog
AS $$
  SELECT session_user <> 'authenticator';
$$;

COMMENT ON FUNCTION public.caller_is_direct_connection() IS
  'TUL-1748: true when the LOGIN role is not PostgREST''s authenticator, i.e. a migration, the SQL editor, psql or pg_cron; false for every API request. session_user is unaffected by SET ROLE and SECURITY DEFINER.';

REVOKE ALL ON FUNCTION public.caller_is_direct_connection() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.caller_is_direct_connection() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.caller_is_direct_connection() TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. engine_caller_may_write_tenant_finances: service_role (verified JWT role) or a direct
--    connection, else staff of the tenant. An empty jwt role is no longer a shortcut.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.engine_caller_may_write_tenant_finances(
  p_tenant_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role TEXT;
BEGIN
  v_caller_role := COALESCE(
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    ''
  );

  IF v_caller_role = 'service_role' OR public.caller_is_direct_connection() THEN
    RETURN TRUE;
  END IF;

  IF p_tenant_id IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN public.is_staff_of_tenant(p_tenant_id);
END;
$$;

COMMENT ON FUNCTION public.engine_caller_may_write_tenant_finances(UUID) IS
  'Authorization gate for SECURITY DEFINER financial RPCs that accept an end-user caller. True for service_role (verified JWT role), for a direct database connection (session_user is not authenticator, TUL-1748), and for staff of the tenant (which includes platform admins).';

REVOKE ALL ON FUNCTION public.engine_caller_may_write_tenant_finances(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.engine_caller_may_write_tenant_finances(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.engine_caller_may_write_tenant_finances(UUID) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. agencies_guard_commercial_terms: same idiom as 20261231424500, with the same shared helper.
--    The trigger itself (created in 424500) is untouched.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.agencies_guard_commercial_terms()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role TEXT;
BEGIN
  IF NEW.settings -> 'commercialTerms' IS DISTINCT FROM OLD.settings -> 'commercialTerms' THEN
    v_caller_role := COALESCE(
      NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
      NULLIF(current_setting('request.jwt.claim.role', true), ''),
      ''
    );

    IF v_caller_role = 'service_role'
       OR public.caller_is_direct_connection()
       OR public.is_platform_admin()
       OR EXISTS (
         SELECT 1
         FROM public.agency_memberships m
         WHERE m.profile_id = auth.uid()
           AND m.tenant_id  = NEW.id
           AND m.status     = 'active'
           AND m.role IN ('owner', 'admin')
       )
    THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Only a workspace owner or admin can change commercial terms.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.agencies_guard_commercial_terms() IS
  'TUL-1311: BEFORE UPDATE guard on agencies.settings->commercialTerms. Allows service_role, a direct database connection (TUL-1748), platform admins and active owner/admin members only.';

REVOKE ALL ON FUNCTION public.agencies_guard_commercial_terms() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.agencies_guard_commercial_terms() FROM anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Smoke: the session applying this migration must itself be a direct connection. If someone
--    applies it through the API the helper reads false and this stops the migration.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT public.caller_is_direct_connection() THEN
    RAISE EXCEPTION 'TUL-1748: this migration must run on a direct connection, not through PostgREST (session_user = %)', session_user;
  END IF;
END $$;
