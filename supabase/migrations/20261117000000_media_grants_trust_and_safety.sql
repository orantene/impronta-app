-- 20261117000000_media_grants_trust_and_safety.sql
--
-- Batch A of `web/docs/execution-plan-2026-08-15.md` — the trust & safety pass
-- over the two-key media grant rail (migrations 20261115000000 + 20261116000000).
--
-- THREE INDEPENDENT FIXES, ONE MIGRATION
-- ──────────────────────────────────────
--   A1    `mg_update_own_subject` WITH CHECK verified only `grant_kind`, so an
--         authenticated talent holding ONE subject grant could PATCH it to
--         point at any asset UUID, forge `granted_by`, and clear `revoked_at`.
--         USING gated the row they could reach; WITH CHECK never gated the row
--         they could turn it INTO.
--   A2    `media_grant_active` / `media_asset_presentable_on_tenant` /
--         `media_assets_presentable_on_tenant` /
--         `media_assets_watermark_required_on_tenant` were EXECUTE-able by
--         `anon`. The predicate joins `agency_talent_roster` directly, so an
--         anonymous caller holding an asset UUID could enumerate which hubs a
--         photo presents on — i.e. non-public roster membership.
--   D-7a  `media_grants.expires_at` is dropped. Both predicates honoured it and
--         no writer has ever set it; there is no expiry sweep and no cache bust
--         at expiry, so wiring the UI later would have inherited a silent
--         stale-cache bug. Dropping is cheaper than building the sweep, and the
--         column is trivially re-addable when a product need exists (D-7).
--
-- NOTE ON THE FILENAME TIMESTAMP
-- ──────────────────────────────
-- Same reason as 20261115000000 / 20261116000000: this repo's migration
-- sequence runs AHEAD of the wall clock (applied tip is 20261116000000). A
-- `date -u` name would sort behind ~40 already-applied migrations and trip
-- `supabase db push` history drift, so this file continues the sequence.
-- One migration this agent, no timestamp collision.
--
-- APPLY VIA MCP `execute_sql` + a manual `schema_migrations` row — `db push`
-- is blocked by history drift on this project (project_supabase_push_protocol).

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. D-7a — drop expires_at, predicates FIRST
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The two predicates below are recreated with the `expires_at` arm removed
-- BEFORE the column goes, so neither the DROP nor any concurrent call ever
-- sees a function body referencing a column that no longer exists. Bodies are
-- otherwise byte-identical to 20261115000000 / 20261116000000.

CREATE OR REPLACE FUNCTION public.media_grant_active(
  p_asset_id  UUID,
  p_tenant_id UUID,
  p_kind      TEXT
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.media_grants g
    WHERE g.asset_id   = p_asset_id
      AND g.grant_kind = p_kind
      AND g.revoked_at IS NULL
      AND (
        g.scope = 'all_hubs'
        OR (g.scope = 'master' AND p_tenant_id IS NULL)
        OR (g.scope = 'tenant' AND p_tenant_id IS NOT NULL AND g.tenant_id = p_tenant_id)
      )
  );
$$;

COMMENT ON FUNCTION public.media_grant_active(UUID, UUID, TEXT) IS
  'Is there an unrevoked media_grants row of this kind covering this surface? p_tenant_id NULL = master surface. A grant ends by revocation only — the expires_at column was dropped in 20261117000000 (D-7a) because nothing wrote it and nothing swept it.';

CREATE OR REPLACE FUNCTION public.media_assets_watermark_required_on_tenant(
  p_asset_ids UUID[],
  p_tenant_id UUID
)
RETURNS TABLE (asset_id UUID)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT g.asset_id
  FROM public.media_grants g
  WHERE g.asset_id = ANY(p_asset_ids)
    AND g.grant_kind = 'owner'
    AND g.watermark_required
    AND g.revoked_at IS NULL
    AND (
      g.scope = 'all_hubs'
      OR (g.scope = 'master' AND p_tenant_id IS NULL)
      OR (g.scope = 'tenant' AND p_tenant_id IS NOT NULL AND g.tenant_id = p_tenant_id)
    );
$$;

-- Now the column itself. Zero live rows carry a value (verified 2026-08-15:
-- media_grants is empty), so this drops no data.
ALTER TABLE public.media_grants DROP COLUMN IF EXISTS expires_at;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. A1 — the subject UPDATE policy gets a real WITH CHECK
-- ═══════════════════════════════════════════════════════════════════════════
--
-- USING says which rows you may reach. WITH CHECK says what you may turn them
-- into, and it was checking only `grant_kind = 'subject'` — which the row
-- already was. Everything else was writable: `asset_id` to any UUID in the
-- system, `granted_by` to any profile, `revoked_at` back to NULL, `scope` /
-- `tenant_id` to any surface.
--
-- Bounded today because the owner key still gates publishing and a forged
-- subject row alone presents nothing. It is not bounded as a CONSENT RECORD:
-- these rows are the audit trail for "the person in the photo agreed", and a
-- talent could forge one against a stranger's asset. Mirroring the INSERT
-- policy closes both halves.
DROP POLICY IF EXISTS mg_update_own_subject ON public.media_grants;
CREATE POLICY mg_update_own_subject ON public.media_grants
  FOR UPDATE
  USING (
    grant_kind = 'subject'
    AND EXISTS (
      SELECT 1
        FROM public.media_assets a
        JOIN public.talent_profiles tp ON tp.id = a.owner_talent_profile_id
       WHERE a.id = media_grants.asset_id
         AND tp.user_id = auth.uid()
    )
  )
  WITH CHECK (
    grant_kind = 'subject'
    -- The row must still be a consent record THIS caller owns, on a photo of
    -- THIS caller. Identical to mg_insert_own_subject's WITH CHECK on purpose:
    -- an UPDATE that can reach a state an INSERT could not is a bypass.
    AND granted_by = auth.uid()
    AND EXISTS (
      SELECT 1
        FROM public.media_assets a
        JOIN public.talent_profiles tp ON tp.id = a.owner_talent_profile_id
       WHERE a.id = media_grants.asset_id
         AND tp.user_id = auth.uid()
    )
  );

COMMENT ON POLICY mg_update_own_subject ON public.media_grants IS
  'A subject may revoke (or re-point) their OWN consent key on a photo of THEMSELVES. WITH CHECK re-asserts the subject predicate and granted_by so the post-image row is one the caller could equally have inserted (Batch A / A1).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. A2 — anon loses EXECUTE on the grant predicates
-- ═══════════════════════════════════════════════════════════════════════════
--
-- These functions are SECURITY DEFINER and join `agency_talent_roster`, so
-- calling one is an oracle: "is asset X presentable on hub Y?" answers "is
-- this talent on hub Y's roster?" for anyone with two UUIDs and no session.
--
-- IMPORTANT — the public /directory DOES reach the two batch functions with an
-- anon-key client (`createPublicSupabaseClient` → `fetchDirectoryPage` →
-- `resolveTalentCardThumbsForHub`). The plan's premise that "the storefront
-- never calls these as anon" is false, and revoking alone would have blanked
-- every public directory card once the resolver fails closed (A3). The
-- companion change ships in the same PR: `filterPresentableAssetIds` and
-- `resolveWatermarkPolicy` now issue these RPCs through the service-role
-- client. Both functions are auth-independent — they read (asset, tenant) and
-- nothing else — so the answer is identical, only the caller's role changes.
--
-- `authenticated` and `service_role` keep EXECUTE.
REVOKE EXECUTE ON FUNCTION public.media_grant_active(UUID, UUID, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.media_asset_presentable_on_tenant(UUID, UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.media_assets_presentable_on_tenant(UUID[], UUID) FROM anon;
-- Not named in the plan's A2, but it leaks the same roster membership through
-- the same join shape and is reached the same way. Left granted, it would be
-- the obvious next probe.
REVOKE EXECUTE ON FUNCTION public.media_assets_watermark_required_on_tenant(UUID[], UUID) FROM anon;

COMMIT;
