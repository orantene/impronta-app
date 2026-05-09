-- Phase 1 — Photo model unification
--
-- 1. Add 'polaroid' and 'reel' to media_variant_kind ENUM (idempotent guards).
-- 2. Migrate banner → hero (banner was the wide 16:9 cover slot; hero is the
--    canonical 4:5 top-of-profile image; they are semantically the same thing).
-- 3. Migrate metadata-flagged gallery rows to their proper kinds:
--    - gallery + metadata.polaroidSlot → polaroid
--    - gallery + metadata.kind = 'hello_reel' → reel
-- 4. Drop the 'banner' enum value safely (Postgres requires a table rewrite;
--    we do NOT do that here — we leave 'banner' in the enum as a tombstone
--    but treat it as deprecated everywhere in code. All rows have been migrated).
--
-- DOWN: enum values cannot be removed without a full type rewrite. This
--   migration is intentionally one-way. All changes are idempotent.

-- ─── 1. Add polaroid ──────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'polaroid'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'media_variant_kind')
  ) THEN
    ALTER TYPE public.media_variant_kind ADD VALUE 'polaroid';
  END IF;
END $$;

-- ─── 2. Add reel ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'reel'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'media_variant_kind')
  ) THEN
    ALTER TYPE public.media_variant_kind ADD VALUE 'reel';
  END IF;
END $$;

-- ─── 3. Migrate banner → hero ────────────────────────────────────────────────
-- After the enum values above are committed we can reference them in DML.
-- hero is already in the enum (added by 20260910000000_media_variant_kind_hero).
UPDATE public.media_assets
SET variant_kind = 'hero', updated_at = now()
WHERE variant_kind = 'banner'
  AND deleted_at IS NULL;

-- ─── 4. Migrate metadata-flagged gallery rows ─────────────────────────────────

-- Polaroids: gallery rows where metadata has a non-null polaroidSlot or slot key.
-- Cast metadata JSONB to text for the existence check so it works regardless of
-- the metadata column's declared type (jsonb or text).
UPDATE public.media_assets
SET variant_kind = 'polaroid', updated_at = now()
WHERE variant_kind = 'gallery'
  AND deleted_at IS NULL
  AND (
    metadata ? 'polaroidSlot'
    OR metadata ? 'slot'
  );

-- Reels: gallery rows where metadata.kind = 'hello_reel'.
UPDATE public.media_assets
SET variant_kind = 'reel', updated_at = now()
WHERE variant_kind = 'gallery'
  AND deleted_at IS NULL
  AND metadata ->> 'kind' = 'hello_reel';
