-- Phase 3.12 — talent_service_areas free-text city column.
--
-- Background:
--   The original 20260801120150 migration modeled service areas with
--   `location_id` FK to public.locations, which is correct for structured
--   directory filtering. However the canonical roster edit UI (added in
--   3bfd47b) ships a simpler "type a city name" UX so an agency admin can
--   record where a talent works without seeding a locations row first.
--
--   This mirrors the talent_profiles.home_city_text pattern: free-text
--   alongside the structured location_id. UI reads/writes city; matching
--   to canonical locations happens later (or never, for ad-hoc cities).
--
-- Additive only. location_id stays. Existing rows untouched.
--
-- DOWN (manual):
--   ALTER TABLE public.talent_service_areas DROP COLUMN city;

BEGIN;

-- Add nullable city column.
ALTER TABLE public.talent_service_areas
  ADD COLUMN IF NOT EXISTS city TEXT;

-- location_id was NOT NULL in the original migration. Loosen it to NULL so
-- the new free-text path can insert rows without seeding a locations row.
-- Existing rows are unaffected (they already have location_id).
ALTER TABLE public.talent_service_areas
  ALTER COLUMN location_id DROP NOT NULL;

-- The original UNIQUE constraint was on (talent_profile_id, location_id, service_kind).
-- Now that location_id can be null, that constraint behaves correctly under
-- Postgres semantics (NULL != NULL), but we add a city-aware partial unique
-- index so agencies can't enter the same free-text city twice for the same
-- talent and kind.
CREATE UNIQUE INDEX IF NOT EXISTS ux_talent_service_areas_profile_city_kind
  ON public.talent_service_areas (talent_profile_id, lower(city), service_kind)
  WHERE city IS NOT NULL;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260907120000', 'talent_service_areas_city')
ON CONFLICT (version) DO NOTHING;

COMMIT;
