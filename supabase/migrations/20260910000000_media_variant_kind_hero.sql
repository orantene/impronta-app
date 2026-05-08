-- Add 'hero' to media_variant_kind so the canonical roster editor's
-- "Set as hero" CTA works. The action at
-- web/src/app/(workspace)/[tenantSlug]/admin/roster/[id]/extended-actions.ts
-- (`setTalentHero`) writes variant_kind='hero' but the original enum from
-- 20250409000000_init.sql doesn't include 'hero'. Inserts/updates fail the
-- CHECK constraint and bubble up as the user-facing toast "Could not set
-- hero photo."
--
-- The TalentEditForm + media-gallery-drawer already model 'hero' as a
-- distinct slot ("avatar" | "hero" | "gallery"), so the enum value is the
-- only thing missing.
--
-- DOWN: Postgres doesn't support removing enum values without rewriting
-- the type, so this migration is one-way. Idempotent via the IF NOT EXISTS
-- guard inside the DO block.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'hero'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'media_variant_kind')
  ) THEN
    ALTER TYPE public.media_variant_kind ADD VALUE 'hero';
  END IF;
END $$;
