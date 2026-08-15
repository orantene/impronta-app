-- 20261116000000_media_phase4_watermark_and_collections.sql
--
-- Phase 4 of web/docs/media-ownership-and-brand-library-plan-2026-08-10.md —
-- "polish & monetize". Two small additions, no destructive change:
--
--   1. media_assets_watermark_required_on_tenant() — the read side of the
--      `media_grants.watermark_required` column that phase 3 added and left
--      write-only. Without it the resolver would have to re-derive grant scope
--      matching in TypeScript, which is exactly the drift the phase-3 header
--      forbids ("one predicate, one place").
--
--   2. media_folders.is_collection / shoot_date — per-shoot "collections" are
--      a THIN layer on the folder table the Media page already renders (plan
--      §8 phase 4: "per-shoot collections sugar on folders"). No new table, no
--      new RLS: a collection IS a folder, and every existing folder policy,
--      index and action keeps working unchanged.
--
-- NOTE ON THE FILENAME TIMESTAMP
-- ──────────────────────────────
-- Same reason as 20261115000000: this repo's migration sequence runs AHEAD of
-- the wall clock (applied tip is 20261115000000). A `date -u` name would sort
-- behind ~40 applied migrations and trip `supabase db push` history drift, so
-- this file continues the sequence. One migration this agent.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Watermark-on-release — the read side
-- ═══════════════════════════════════════════════════════════════════════════

-- Which of these assets carry an ACTIVE owner grant that was approved with
-- "require watermark" ticked, for this surface? p_tenant_id IS NULL = master.
--
-- Only the OWNER key can demand a watermark: it is the owner's condition on
-- their own photo travelling. A subject grant is consent, not a condition.
--
-- The scope matching below mirrors media_grant_active() deliberately — same
-- three arms, same order — because both answer questions about the same rows.
-- If one changes, change the other in the same migration.
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
    AND (g.expires_at IS NULL OR g.expires_at > now())
    AND (
      g.scope = 'all_hubs'
      OR (g.scope = 'master' AND p_tenant_id IS NULL)
      OR (g.scope = 'tenant' AND p_tenant_id IS NOT NULL AND g.tenant_id = p_tenant_id)
    );
$$;

COMMENT ON FUNCTION public.media_assets_watermark_required_on_tenant(UUID[], UUID) IS
  'Batch: which of these assets may only appear on this surface WATERMARKED, per an active owner grant approved with watermark_required? p_tenant_id NULL = master surface. Read by web/src/lib/media/watermark-on-release.ts; the baked derivative itself is a media_assets row with variant_kind = ''watermarked'' and source_media_asset_id pointing back here.';

GRANT EXECUTE ON FUNCTION public.media_assets_watermark_required_on_tenant(UUID[], UUID)
  TO authenticated, anon, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Collections — a folder that is also a shoot
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.media_folders
  ADD COLUMN IF NOT EXISTS is_collection BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS shoot_date    DATE;

COMMENT ON COLUMN public.media_folders.is_collection IS
  'true = this folder is a per-shoot COLLECTION (plan §8 phase 4). Sugar on folders, not a second system: every folder policy, action and index applies unchanged. The Media page groups these under their own heading and sorts them by shoot_date.';
COMMENT ON COLUMN public.media_folders.shoot_date IS
  'The day the shoot happened, for collection folders. Nullable — a collection with no date sorts last rather than being rejected.';

-- Collections list newest-shoot-first inside one workspace; ordinary folders
-- never touch this index.
CREATE INDEX IF NOT EXISTS media_folders_tenant_collection_idx
  ON public.media_folders (tenant_id, shoot_date DESC)
  WHERE is_collection;

COMMIT;
