-- 20261126000000_agency_domains_anon_column_scope.sql
--
-- Stop handing `agency_domains.verification_token` to anonymous callers.
--
-- Timestamp note: local sequence, not wall clock. See 20261124000000.
--
--
-- THE LEAK
-- ════════
-- `agency_domains_public_active_select` is `USING (status = 'active')` with no
-- role restriction, and `anon` holds a table-wide SELECT grant. RLS is ROW level,
-- so satisfying the policy hands over EVERY column of that row — including
-- `verification_token`, the domain-ownership proof. Live at authoring time: 41
-- active domain rows readable by any anonymous caller, tokens included.
--
-- The row-level exposure itself is intentional and must stay. This is the
-- platform's host routing table: `web/src/proxy.ts` gates every single request
-- against it via `resolveHostContext()` in `web/src/lib/saas/host-context.ts`,
-- which builds an EDGE client from NEXT_PUBLIC_SUPABASE_ANON_KEY (host-context.ts:139).
-- If anon loses the ability to read this table, every request on every host 404s
-- with "Host not registered". That is a total platform outage, so the fix here is
-- column scope, never row scope and never a policy drop.
--
--
-- WHY COLUMN GRANTS ARE SAFE HERE
-- ═══════════════════════════════
-- A column grant breaks any caller that issues `SELECT *`. Every anon-key reader
-- was enumerated and every one of them names its columns explicitly:
--
--   host-context.ts:180   kind, tenant_id, hostname, status, tenant_slug, is_primary
--   host-context.ts:238   hostname, kind
--   canonical-hosts.ts:90 hostname, status
--   hub-landing.tsx:273   hostname, kind
--   profile-view.tsx:1255 tenant_id, hostname, kind, status, is_primary
--
-- Union = {tenant_id, hostname, kind, status, is_primary, tenant_slug}. `id` is
-- added as headroom; it is a non-sensitive primary key. Verified: no `.select()`
-- without an explicit column list exists against this table anywhere in web/src.
--
--
-- WHAT IS NOT DONE HERE (deliberate, documented residual)
-- ═══════════════════════════════════════════════════════
-- `authenticated` keeps its full-column grant. The public policy has no role
-- clause, so it also matches `authenticated` — meaning any logged-in user can
-- still read the token of any ACTIVE domain. Closing that properly means making
-- `agency_domains_public_active_select` apply `TO anon` only, so `authenticated`
-- falls through to `agency_domains_tenant_staff` (own tenant). That is a bigger
-- change: several `createSupabaseServerClient()` readers (talent/apply-loaders.ts,
-- workspace-config.ts, settings/domain-actions.ts) query this table and would
-- need per-caller tracing first, exactly like bucket 2 in 20261124000000.
-- Column-scoping `authenticated` instead is NOT the answer — staff legitimately
-- need `verification_token` in the domain settings UI, and column grants are
-- role-level, not policy-level, so it would blank that screen.
--
-- Anonymous is the surface that matters today and it closes cleanly. Ship that.

BEGIN;

REVOKE SELECT ON public.agency_domains FROM anon;

GRANT SELECT (
  id,
  tenant_id,
  hostname,
  kind,
  is_primary,
  status,
  tenant_slug
) ON public.agency_domains TO anon;

COMMENT ON COLUMN public.agency_domains.verification_token IS
  'Domain-ownership proof. NOT readable by anon (see 20261126000000): the public active-domain policy is row-level, so a table-wide grant would expose this on all 41 active rows. Routing columns only for anon.';

-- ─── Assertions ────────────────────────────────────────────────────────────
-- NOTE: these deliberately use the privilege catalog rather than `SET LOCAL ROLE
-- anon`. An earlier revision ran the real query as anon to prove routing still
-- worked; `RESET ROLE` did not restore the privileged role before the Supabase
-- CLI appended its own `INSERT INTO supabase_migrations.schema_migrations`, so
-- the push died with "permission denied for schema supabase_migrations" AFTER
-- the DDL had already committed — a half-applied migration with no ledger row.
-- Never leave a role switch live across the end of a migration file.
-- The behavioural check (anon sees 41 routable rows, verification_token raises
-- insufficient_privilege) was run separately as a read-only probe instead.

-- Staff/authenticated must not have been collaterally damaged.
DO $$
BEGIN
  IF NOT has_column_privilege('authenticated', 'public.agency_domains', 'verification_token', 'SELECT') THEN
    RAISE EXCEPTION 'assertion failed: authenticated LOST verification_token — the domain settings UI would blank';
  END IF;
  IF NOT has_column_privilege('anon', 'public.agency_domains', 'hostname', 'SELECT') THEN
    RAISE EXCEPTION 'assertion failed: anon LOST hostname — host routing is dead';
  END IF;
  IF has_column_privilege('anon', 'public.agency_domains', 'verification_token', 'SELECT') THEN
    RAISE EXCEPTION 'assertion failed: anon still holds verification_token';
  END IF;
END;
$$;

COMMIT;
