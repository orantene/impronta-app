-- SaaS Phase 5 / M6 — Governed Design Controls.
--
-- Scope:
--   1. Split `agency_branding.theme_json` into draft + live:
--        theme_json         — LIVE (storefront reads this; set only at publish).
--        theme_json_draft   — DRAFT (design editor reads/writes this).
--   2. Record the last-publish timestamp for cache freshness + UI labeling.
--   3. Extend `agency_branding_revisions` with a `kind` column so the draft /
--      publish / rollback surfaces share the same revision log (mirrors the
--      M3/M4/M5 pattern).
--
-- Non-goals (explicitly):
--   - No change to M1 branding fields (primary_color/secondary_color/accent_color/
--     neutral_color/*_media_asset_id/font_preset/heading_font/body_font). Those
--     remain on the direct-commit `saveBranding` path and are NOT governed by
--     design.publish. The token system layers ON TOP of them via `theme_json`.
--   - No NEW table. We extend the existing `agency_branding` / `agency_branding_
--     revisions` pair so the caching, RLS, retention, and revision browsing that
--     M0 shipped keep working unchanged.
--   - No mutation of existing data. Every tenant keeps their current theme_json
--     (which was `{}`::jsonb by default in M0). Draft starts as a copy of the
--     live row, and `theme_published_at` is NULL until the first design.publish.
--
-- Ref:
--   - docs/saas/phase-5/00-guardrails.md §3 (Ownership), §9 (Safety Gates),
--     §12 (Entitlements).
--   - web/src/lib/site-admin/tokens/registry.ts (token allowlist + validator).

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. agency_branding — split draft / live + publish timestamp
-- ---------------------------------------------------------------------------

ALTER TABLE public.agency_branding
  ADD COLUMN IF NOT EXISTS theme_json_draft JSONB       NOT NULL DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS theme_published_at TIMESTAMPTZ;

COMMENT ON COLUMN public.agency_branding.theme_json IS
  'LIVE design tokens (merged with platform defaults at render time). Written ONLY by publishDesign; storefront reads this via loadPublicBranding. Never mutated by saveDesignDraft.';

COMMENT ON COLUMN public.agency_branding.theme_json_draft IS
  'DRAFT design tokens — the design editor''s working copy. Written by saveDesignDraft. Has NO public effect until publishDesign copies it into theme_json. Rollbacks land here.';

COMMENT ON COLUMN public.agency_branding.theme_published_at IS
  'Timestamp of the last successful publishDesign. NULL = tokens have never been published; storefront falls through to registry defaults. Used for stale-draft warnings in the composer UI.';

-- Seed: existing rows get a draft == live copy so the editor can open a
-- pre-populated form without the operator having to re-enter every value.
-- Tenants that have never set theme_json still see `{}` in both columns.
UPDATE public.agency_branding
   SET theme_json_draft = theme_json
 WHERE theme_json_draft = '{}'::JSONB
   AND theme_json IS DISTINCT FROM '{}'::JSONB;

-- ---------------------------------------------------------------------------
-- 2. agency_branding_revisions — add `kind` column
-- ---------------------------------------------------------------------------
--
-- Existing rows are all `published` (M1 branding edits route through the
-- direct-commit saveBranding path, which writes a published-equivalent
-- snapshot). Default 'published' keeps the log consistent.

ALTER TABLE public.agency_branding_revisions
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'published';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'agency_branding_revisions_kind_check'
       AND conrelid = 'public.agency_branding_revisions'::regclass
  ) THEN
    ALTER TABLE public.agency_branding_revisions
      ADD CONSTRAINT agency_branding_revisions_kind_check
      CHECK (kind IN ('draft', 'published', 'rollback'));
  END IF;
END
$$;

COMMENT ON COLUMN public.agency_branding_revisions.kind IS
  'Revision kind. draft = saveDesignDraft. published = publishDesign (M6) or saveBranding (M1 direct-commit). rollback = restoreDesignRevision. Mirrors cms_page_revisions.kind / cms_section_revisions.kind.';

-- Kind-aware history lookup. The design composer filters on kind when
-- rendering the "restore to draft" list; the branding admin lists all kinds.
CREATE INDEX IF NOT EXISTS idx_agency_branding_revisions_tenant_kind_created
  ON public.agency_branding_revisions (tenant_id, kind, created_at DESC);

-- ---------------------------------------------------------------------------
-- 3. Row-level security — unchanged
-- ---------------------------------------------------------------------------
--
-- `agency_branding_staff_all` + `agency_branding_public_select` already cover
-- the draft column — JSONB adds don't change RLS semantics.
-- `agency_branding_revisions_staff_read` / `_staff_insert` already cover the
-- new `kind` column.
--
-- No new RLS policies needed.

COMMIT;
