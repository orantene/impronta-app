-- Backfill public.talent_service_areas from existing location data.
--
-- Sources:
--   1. talent_profiles.location_id           -> home_base row
--   2. talent_profiles.destinations TEXT[]   -> travel_to rows (resolved
--      back to locations.id by display_name_en or display_name_es match)
--
-- Unmatched destination names (free-text values like "Anywhere in Mexico")
-- are skipped — they remain only in talent_profiles.destinations until a
-- future write to talent_service_areas overwrites the cache. This is an
-- accepted V1 limitation; admins should add real public.locations rows for
-- common destinations and re-run a sync script.
--
-- Cache trigger is disabled during the bulk load and re-enabled at the end
-- with a single resync UPDATE.
--
-- DOWN (manual):
--   DELETE FROM public.talent_service_areas WHERE created_at <= now();

BEGIN;

-- Pause cache trigger for the duration of the bulk load.
ALTER TABLE public.talent_service_areas DISABLE TRIGGER trg_talent_service_areas_refresh_cache;

-- ─── Source 1: home_base from talent_profiles.location_id ──────────────────
INSERT INTO public.talent_service_areas (
  tenant_id,
  talent_profile_id,
  location_id,
  service_kind,
  display_order
)
SELECT
  COALESCE(tp.created_by_agency_id, '00000000-0000-0000-0000-000000000001'::UUID),
  tp.id,
  tp.location_id,
  'home_base',
  0
  FROM public.talent_profiles tp
 WHERE tp.location_id IS NOT NULL
   AND tp.deleted_at IS NULL
ON CONFLICT (talent_profile_id, location_id, service_kind) DO NOTHING;

-- ─── Source 2: travel_to from talent_profiles.destinations TEXT[] ──────────
WITH dest_pairs AS (
  SELECT
    tp.id                    AS talent_profile_id,
    tp.created_by_agency_id  AS created_by_agency_id,
    tp.location_id           AS home_location_id,
    btrim(name)              AS raw_name,
    ROW_NUMBER() OVER (PARTITION BY tp.id ORDER BY ordinality) AS display_order
    FROM public.talent_profiles tp,
         UNNEST(tp.destinations) WITH ORDINALITY AS u(name, ordinality)
   WHERE array_length(tp.destinations, 1) IS NOT NULL
     AND tp.deleted_at IS NULL
),
resolved AS (
  SELECT
    dp.talent_profile_id,
    dp.created_by_agency_id,
    dp.display_order,
    (SELECT loc.id
       FROM public.locations loc
      WHERE loc.archived_at IS NULL
        AND (
          lower(loc.display_name_en) = lower(dp.raw_name)
          OR lower(COALESCE(loc.display_name_es, '')) = lower(dp.raw_name)
          OR lower(loc.city_slug) = lower(regexp_replace(dp.raw_name, '\s+', '-', 'g'))
        )
      LIMIT 1) AS resolved_location_id,
    dp.home_location_id
  FROM dest_pairs dp
)
INSERT INTO public.talent_service_areas (
  tenant_id,
  talent_profile_id,
  location_id,
  service_kind,
  display_order
)
SELECT
  COALESCE(r.created_by_agency_id, '00000000-0000-0000-0000-000000000001'::UUID),
  r.talent_profile_id,
  r.resolved_location_id,
  'travel_to',
  r.display_order::INTEGER
  FROM resolved r
 WHERE r.resolved_location_id IS NOT NULL
   -- Skip if it would duplicate the home_base row.
   AND (r.home_location_id IS NULL OR r.resolved_location_id <> r.home_location_id)
ON CONFLICT (talent_profile_id, location_id, service_kind) DO NOTHING;

-- ─── Resync destinations[] cache for profiles with new junction rows ───────
UPDATE public.talent_profiles tp
   SET destinations = COALESCE(agg.names, ARRAY[]::TEXT[])
  FROM (
    SELECT
      tsa.talent_profile_id,
      array_agg(loc.display_name_en ORDER BY tsa.display_order, loc.display_name_en) AS names
      FROM public.talent_service_areas tsa
      JOIN public.locations loc ON loc.id = tsa.location_id
     WHERE tsa.service_kind IN ('home_base','travel_to')
     GROUP BY tsa.talent_profile_id
  ) agg
 WHERE tp.id = agg.talent_profile_id;

-- Profiles without junction rows keep whatever destinations[] they had
-- (legacy free-text values are preserved until someone writes a junction
-- row for them).

-- ─── Re-enable cache trigger ───────────────────────────────────────────────
ALTER TABLE public.talent_service_areas ENABLE TRIGGER trg_talent_service_areas_refresh_cache;

COMMIT;
