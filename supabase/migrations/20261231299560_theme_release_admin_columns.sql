-- Theme releases (Phase 3): admin-only columns on talent_theme_releases.
-- Additive. `base_payload` is the Design payload at from_version (the catalog
-- keeps only the current payload, so the merge base is captured when the draft
-- release is created). `dry_run_report` already exists and names other talents'
-- sites, so neither column may be readable by talents: the blanket table SELECT
-- grant is replaced by a column list that leaves both out. Writes stay
-- service-role only. Phase 4 readers must name their columns (no select *).

ALTER TABLE public.talent_theme_releases
  ADD COLUMN IF NOT EXISTS base_payload jsonb;

REVOKE SELECT ON public.talent_theme_releases FROM authenticated;
GRANT SELECT (
  id, design_slug, from_version, to_version, channel, status, notes, items,
  rollout_pct, critical, created_at, published_at, updated_at
) ON public.talent_theme_releases TO authenticated;
