-- Builder Catalog Overlay — 4-surface matrix (Builder Lab Polish X4)
-- ============================================================================
-- The overlay's per-surface visibility was a 2-toggle axis
-- (`talent_enabled` / `workspace_enabled`). The audit (X1's read-only
-- `deriveSurfaceMatrix`) exposed that this is LOSSY: the four real builder
-- surfaces collapse onto two toggles — in particular the talent Max-SITE-SHELL
-- is governed by the WORKSPACE toggle (because `buildSiteShellBuilderConfig`
-- hardcodes surfaceTarget:'workspace'). Hiding a component "from Workspace"
-- silently also hid it from a talent's own Max-site header/footer.
--
-- X4 makes the four surfaces independent. We ADD four boolean columns — one per
-- real surface — and BACKFILL them losslessly from the existing two so no
-- visibility state changes the day this lands:
--
--   talent_profile_enabled  ⇐ talent_enabled     (talent profile page builder)
--   talent_shell_enabled    ⇐ talent_enabled     (talent Max-site header/footer)
--   workspace_page_enabled  ⇐ workspace_enabled  (agency freeform pages)
--   workspace_shell_enabled ⇐ workspace_enabled  (agency site header/footer)
--
-- NOTE the lossless mapping deliberately moves the talent SHELL OFF the
-- workspace toggle and ONTO the talent toggle's value — this is the corrected
-- intent (the talent shell belongs with the talent's own catalog), applied as a
-- no-op for any tenant whose two legacy toggles agree (the overwhelmingly common
-- case: both default true). Where they DIVERGE, the new talent_shell follows the
-- TALENT value, which is the bug fix this whole task exists to make.
--
-- The legacy `talent_enabled` / `workspace_enabled` columns are KEPT (NOT
-- dropped) — dual-write for safety + a clean rollback. App code dual-writes both
-- the legacy pair and the new quad on every overlay upsert.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + a guarded one-shot backfill.
-- ============================================================================

BEGIN;

ALTER TABLE public.builder_catalog_overlay
  ADD COLUMN IF NOT EXISTS talent_profile_enabled  boolean NOT NULL DEFAULT true;
ALTER TABLE public.builder_catalog_overlay
  ADD COLUMN IF NOT EXISTS talent_shell_enabled    boolean NOT NULL DEFAULT true;
ALTER TABLE public.builder_catalog_overlay
  ADD COLUMN IF NOT EXISTS workspace_page_enabled  boolean NOT NULL DEFAULT true;
ALTER TABLE public.builder_catalog_overlay
  ADD COLUMN IF NOT EXISTS workspace_shell_enabled boolean NOT NULL DEFAULT true;

-- One-shot LOSSLESS backfill from the legacy 2-toggle pair. Runs once: the
-- `NOT DISTINCT FROM` guard keys off the still-default rows so a re-run (or a
-- later manual edit) is never clobbered. talent_* ⇐ talent_enabled,
-- workspace_* ⇐ workspace_enabled.
UPDATE public.builder_catalog_overlay
   SET talent_profile_enabled  = COALESCE(talent_enabled, true),
       talent_shell_enabled    = COALESCE(talent_enabled, true),
       workspace_page_enabled  = COALESCE(workspace_enabled, true),
       workspace_shell_enabled = COALESCE(workspace_enabled, true)
 WHERE talent_profile_enabled IS NOT DISTINCT FROM true
   AND talent_shell_enabled    IS NOT DISTINCT FROM true
   AND workspace_page_enabled  IS NOT DISTINCT FROM true
   AND workspace_shell_enabled IS NOT DISTINCT FROM true
   AND (talent_enabled = false OR workspace_enabled = false);

COMMIT;
