-- Close the last anon-executable mutating function with no internal check.
--
-- `public.ensure_city_location(...)` is SECURITY DEFINER, INSERTs into the
-- shared `locations` table, and reads nothing about its caller: no auth.uid(),
-- no ownership check, no tenant check. Anyone on the internet could add
-- arbitrary countries and cities to a table every tenant's location pickers,
-- directory facets and map view read from.
--
-- It is the last of the four found on 2026-09-03. The other three
-- (replace_talent_languages, refresh_talent_skill_metrics_all,
-- sync_location_taxonomy_terms) are already revoked.
--
-- ── WHY THIS ONE KEEPS `authenticated` AND THE OTHERS DID NOT ────────────────
-- This is the part worth reading before copying the previous migrations.
--
-- refresh_talent_skill_metrics_all and sync_location_taxonomy_terms were
-- revoked from PUBLIC, anon AND authenticated, which was correct: their only
-- caller is a cron route using createServiceRoleClient, and service_role
-- bypasses grants entirely.
--
-- ensure_city_location is different. Its only call path is
--   updateTalentProfile (server action)
--     -> requireStaff() -> requireSession()
--     -> resolveCanonicalLocationSelection(supabase, ...)   [canonical-location.ts:118]
-- and that `supabase` is the CALLER'S USER-SCOPED SESSION CLIENT, not a
-- service-role one — admin-scope.ts states it outright: "`supabase` is ALWAYS
-- the caller's user-scoped session client". A staff user therefore reaches this
-- function as the `authenticated` role.
--
-- So revoking `authenticated` here would break staff editing any talent's
-- residence or origin city, and it would break it the quiet way: the action
-- returns an error the admin reads as "save failed", with nothing naming a
-- grant. Verified the caller before choosing, rather than repeating the shape
-- of the previous fix.
--
-- ── BOTH HALVES ARE REQUIRED ────────────────────────────────────────────────
-- CREATE FUNCTION grants EXECUTE to PUBLIC by default, and PUBLIC is a SEPARATE
-- grant from any role grant. `REVOKE ... FROM anon` alone leaves the PUBLIC
-- entry intact and the function still reachable; `REVOKE ... FROM PUBLIC` alone
-- leaves a named-role grant intact. Neither is sufficient. Assert with
-- has_function_privilege afterwards, never by reading the migration.
--
-- The grant is the outer door, not the lock. The durable fix is
-- scripts/check-anon-function-grants.mjs, which fails when any mutating,
-- anon-reachable function has no internal caller check — so a future re-grant
-- is a failing check rather than a silent regression.

REVOKE EXECUTE ON FUNCTION public.ensure_city_location(
  text, text, text, text, text, text, double precision, double precision, bigint
) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.ensure_city_location(
  text, text, text, text, text, text, double precision, double precision, bigint
) FROM anon;

-- authenticated is DELIBERATELY retained. See above.
