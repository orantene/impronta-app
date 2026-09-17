-- Ticket tiers carry their own presentation (owner ask, 2026-09-17).
--
-- A tier's featured image, badge, "includes" bullets and short description
-- are set where the tier is created (event → Tickets & Offers), for every
-- tenant, not only as a builder override on one page. The builder's per-tier
-- overrides (`ticket_picker.tiers[]`) stay as optional overrides layered on
-- top; when both exist the builder override wins for that field.
--
-- Shape: { image_media_id?: uuid, badge?: string, includes?: string[], description?: string }
--   image_media_id  → public.media_assets.id (resolved to public_url by the readers)
--   badge           → short uppercase-able label ("VIP", "Early bird"), ≤ 24 chars
--   includes        → bullets, one per entry, each ≤ 120 chars, ≤ 12 entries
--   description     → one short sentence, ≤ 280 chars
-- Normalised in web/src/lib/events/tier-presentation.ts; unknown keys are
-- dropped on read, so the column may grow without a rewrite.
--
-- Additive only: NOT NULL with a default, so every existing row reads `{}`.
-- Code tolerates the column being absent for one deploy (the readers select
-- it in a separate, failure-tolerant query and treat undefined as `{}`).

BEGIN;

ALTER TABLE public.talent_offering_variants
  ADD COLUMN IF NOT EXISTS presentation jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.talent_offering_variants
  DROP CONSTRAINT IF EXISTS talent_offering_variants_presentation_is_object;

ALTER TABLE public.talent_offering_variants
  ADD CONSTRAINT talent_offering_variants_presentation_is_object
  CHECK (jsonb_typeof(presentation) = 'object');

COMMENT ON COLUMN public.talent_offering_variants.presentation IS
  'Tier presentation set by the operator: { image_media_id?: uuid (media_assets.id), badge?: string, includes?: string[], description?: string }. Builder ticket_picker.tiers[] overrides win per field.';

COMMIT;
