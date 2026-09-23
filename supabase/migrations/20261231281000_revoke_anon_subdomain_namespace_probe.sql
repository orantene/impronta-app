-- Revoke anon EXECUTE on the subdomain-namespace functions
-- =============================================================================
-- 20261231280000 intended to deny anon the namespace predicate. Its comment is
-- explicit: "NEVER granted to anon: an anonymous visitor must not be able to
-- enumerate the namespace." It did not achieve that, and the objects shipped to
-- production anon-executable.
--
-- WHY THE REVOKE MISSED
--   The migration wrote:
--     revoke all on function public.platform_subdomain_label_taken(...) from public;
--     grant execute ... to authenticated, service_role;
--   `from public` removes the PUBLIC pseudo-role entry. But this project runs
--   `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO
--   anon, authenticated, service_role` (pg_default_acl, granted by both
--   `postgres` and `supabase_admin`), so at CREATE time anon receives a DIRECT
--   grant. Revoking PUBLIC leaves that direct grant untouched.
--
--   Observed on production after 280000 applied:
--     proacl = {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
--   Note the absent `=X/postgres` (PUBLIC) entry: the revoke ran and did
--   exactly what it said, which is why this was invisible to review. Compare
--   talent_site_subdomain_lookup, which still carries `=X/postgres`.
--
--   This is the same shape as the anon-executable DEFINER RPCs found on
--   2026-09-03: a deny that names the wrong grantee reads as a deny.
--
-- WHAT WAS EXPOSED
--   `platform_subdomain_label_taken` is SECURITY DEFINER and reads `agencies`,
--   `agency_domains`, `saas_subdomain_reservations` and `talent_sites` — none
--   of which anon may read broadly. It returns a boolean, so an anonymous
--   caller could use it as an ORACLE: probe any label and learn whether it is
--   taken. That discloses, without any session:
--     * which workspace slugs and subdomain hosts exist,
--     * that a signup is IN FLIGHT for a given name (an unexpired
--       saas_subdomain_reservations row, i.e. someone is mid-signup for a brand),
--     * any `talent_sites.site_slug`, with NO published/visibility filter —
--       unlike talent_site_subdomain_lookup, which correctly returns only
--       published, non-hidden talents.
--   No talent site slugs exist yet (`select count(*) ... where site_slug is not
--   null` = 0), so nothing has actually leaked; the last item is a future
--   exposure being closed before it has data to disclose.
--
-- THE THREE TRIGGER FUNCTIONS are fixed for the same reason. EXECUTE is checked
-- when a trigger is CREATED, never when it fires, so no API role needs it —
-- 20261231278000 already states this rule and applies it to its own trigger
-- helper. 280000 did not, leaving three SECURITY DEFINER functions directly
-- callable by anon.
--
-- `talent_site_subdomain_lookup` KEEPS anon EXECUTE. That one is deliberate and
-- load-bearing: the middleware resolves a talent host on every anonymous
-- request, before a session exists. It is re-granted below so a future
-- grant-lock sweep reading this file sees the intent stated positively.
--
-- Idempotent. Additive: no object is created, altered or dropped.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The namespace predicate — authenticated + service_role only.
-- ─────────────────────────────────────────────────────────────────────────────
revoke all on function public.platform_subdomain_label_taken(text, uuid, uuid)
  from public, anon;

grant execute on function public.platform_subdomain_label_taken(text, uuid, uuid)
  to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Trigger helpers — no API role needs EXECUTE.
-- ─────────────────────────────────────────────────────────────────────────────
revoke all on function public.talent_sites_subdomain_guard()
  from public, anon, authenticated;

revoke all on function public.agency_domains_subdomain_guard()
  from public, anon, authenticated;

revoke all on function public.agencies_slug_subdomain_guard()
  from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. The host resolver stays public, on purpose.
-- ─────────────────────────────────────────────────────────────────────────────
grant execute on function public.talent_site_subdomain_lookup(text)
  to anon, authenticated;
