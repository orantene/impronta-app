-- Media Gallery + Watermark — Phase 0 schema additions
-- 2026-05-07
--
-- 1. media_assets gains two nullable columns:
--    • watermark_override_json — per-image watermark config overriding workspace default
--    • source_media_asset_id   — links a baked 'watermarked' variant to its source
--
-- 2. media_variant_kind ENUM gains 'watermarked'
--
-- The workspace-level default watermark preset is stored in
-- agencies.settings.branding.watermark_preset (JSONB), so no separate
-- table migration is needed for the default.
--
-- Preset JSON shape (both workspace default and per-image override):
--   {
--     enabled:      boolean
--     position:     'tl'|'tc'|'tr'|'ml'|'mc'|'mr'|'bl'|'bc'|'br'
--     size_pct:     number    -- 4–25, % of image shorter edge
--     opacity:      number    -- 0.0–1.0
--     padding_pct:  number    -- 0–10, % inset from edge
--     variant:      'light'|'dark'
--   }

-- ─── 1. Extend media_variant_kind ENUM ───────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'watermarked'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'media_variant_kind')
  ) THEN
    ALTER TYPE public.media_variant_kind ADD VALUE 'watermarked';
  END IF;
END
$$;

-- ─── 2. Add watermark_override_json to media_assets ──────────────────────────

ALTER TABLE public.media_assets
  ADD COLUMN IF NOT EXISTS watermark_override_json JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS source_media_asset_id   UUID  DEFAULT NULL
    REFERENCES public.media_assets(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.media_assets.watermark_override_json IS
  'Per-image watermark config. Null = use workspace default from agencies.settings.branding.watermark_preset. Same JSON shape as the workspace preset.';

COMMENT ON COLUMN public.media_assets.source_media_asset_id IS
  'For variant_kind=watermarked rows: points back to the original media_asset that was baked. Null for non-baked rows.';

-- Index for lookup in bake pipeline: "give me existing baked variant for source X"
CREATE INDEX IF NOT EXISTS idx_media_assets_source_id
  ON public.media_assets (source_media_asset_id)
  WHERE source_media_asset_id IS NOT NULL;
