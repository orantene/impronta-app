-- 20261120000000_media_predicates_revoke_public.sql
--
-- Actually close the anon hole that 20261117000000 only appeared to close.
--
-- WHAT WENT WRONG
-- ───────────────
-- 20261117000000 ran `REVOKE EXECUTE ... FROM anon` on the media grant
-- predicates and the audit recorded the hole as closed. It was not.
-- `CREATE FUNCTION` grants EXECUTE to PUBLIC by default, and PUBLIC is a
-- separate grant from any role grant: revoking a role does not cancel it, and
-- `anon` still reaches the function through PUBLIC. Post-deploy check:
--
--   has_function_privilege('anon', 'public.media_assets_presentable_on_tenant(uuid[],uuid)', 'EXECUTE')
--   -- => true, AFTER the revoke
--
-- The ACL shows why — `=X/postgres` is the PUBLIC entry, still present:
--   =X/postgres | postgres=X/postgres | authenticated=X/postgres | service_role=X/postgres
--
-- So `REVOKE ... FROM PUBLIC` is the operative statement. It is kept alongside
-- the role revokes because a future grant to a named role must also be visible.
--
-- WHY THIS IS SAFE TO LAND NOW (it would NOT have been in 20261117000000)
-- ──────────────────────────────────────────────────────────────────────
-- These functions are SECURITY DEFINER and join `agency_talent_roster`, so an
-- anonymous caller holding two UUIDs can read back non-public roster
-- membership. The reason the first revoke could not simply be fixed in place is
-- that the PUBLIC directory used to reach them with an anon-key client
-- (`fetchDirectoryPage()` → `resolveTalentCardThumbsForHub()`); a revoke that
-- actually worked would have blanked every public card photo. That call site
-- now routes through the service-role client (`lib/media/grant-predicate-client.ts`),
-- so nothing anonymous asks these functions any more.
--
-- Verified against the live database before writing this migration:
--   • no RLS policy references any of these functions (they are called from the
--     app, never from a USING/WITH CHECK clause evaluated as the caller)
--   • no view, matview, or other function references them
--   • every application call site uses a service-role client
--
-- `authenticated` KEEPS its explicit grant. `grantPredicateClient()` falls back
-- to the caller's own client when the service-role key is absent (unit tests, a
-- misconfigured env). Revoking `authenticated` would turn that documented
-- fallback into a permission error; leaving it costs nothing, because a logged-in
-- user reaching these predicates is a case RLS already contemplates. Only the
-- anonymous path is closed here.
--
-- `record_media_release_bake_failures` is different: it WRITES, and its single
-- caller chain (admin-media-release.ts → rollBackFailedReleaseBakes →
-- recordFailedReleaseBakes) constructs `createServiceRoleClient()` with no
-- fallback. It loses PUBLIC, anon, AND authenticated. Left open, any anonymous
-- caller could forge pending repair rows into a workspace's queue for any
-- (request, asset) pair whose UUIDs satisfy the foreign keys.

BEGIN;

-- Read predicates: close the anonymous path, keep `authenticated`.
REVOKE EXECUTE ON FUNCTION public.media_assets_presentable_on_tenant(UUID[], UUID)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.media_assets_watermark_required_on_tenant(UUID[], UUID)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.media_asset_presentable_on_tenant(UUID, UUID)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.media_grant_active(UUID, UUID, TEXT)
  FROM PUBLIC, anon;

-- Write path: service_role only.
REVOKE EXECUTE ON FUNCTION public.record_media_release_bake_failures(UUID, UUID[], UUID, UUID, UUID)
  FROM PUBLIC, anon, authenticated;

COMMIT;
