-- Single source of truth for locations:
-- - Authoritative profile location is `public.talent_profiles.location_id` (FK to `public.locations`).
-- - `public.taxonomy_terms` kinds `location_city` and `location_country` are derived mirrors of `public.locations`
--   used only for filtering, labeling, and admin organization (no independent meaning).
--
-- This migration keeps the systems from drifting by syncing taxonomy terms from `public.locations`.

BEGIN;
CREATE OR REPLACE FUNCTION public.sync_location_taxonomy_terms()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Upsert countries (slug: lower(country_code))
  INSERT INTO public.taxonomy_terms (kind, slug, name_en, name_es, sort_order, archived_at, updated_at)
  SELECT
    'location_country'::public.taxonomy_kind,
    lower(l.country_code) AS slug,
    -- Minimal naming: prefer country code name if you later add a country table; for now keep code.
    upper(l.country_code) AS name_en,
    upper(l.country_code) AS name_es,
    0 AS sort_order,
    NULL AS archived_at,
    now() AS updated_at
  FROM public.locations l
  WHERE l.archived_at IS NULL
  GROUP BY lower(l.country_code), upper(l.country_code)
  ON CONFLICT (kind, slug) DO UPDATE
    SET archived_at = NULL,
        updated_at = now();

  -- Upsert cities (slug matches locations.city_slug; names mirror display_name_*).
  INSERT INTO public.taxonomy_terms (kind, slug, name_en, name_es, sort_order, archived_at, updated_at)
  SELECT
    'location_city'::public.taxonomy_kind,
    l.city_slug,
    l.display_name_en,
    l.display_name_es,
    0 AS sort_order,
    l.archived_at,
    now() AS updated_at
  FROM public.locations l
  ON CONFLICT (kind, slug) DO UPDATE
    SET name_en = EXCLUDED.name_en,
        name_es = EXCLUDED.name_es,
        archived_at = EXCLUDED.archived_at,
        updated_at = now();

  -- Archive country terms that no longer exist as active locations.
  UPDATE public.taxonomy_terms t
  SET archived_at = COALESCE(t.archived_at, now()),
      updated_at = now()
  WHERE t.kind = 'location_country'::public.taxonomy_kind
    AND NOT EXISTS (
      SELECT 1
      FROM public.locations l
      WHERE l.archived_at IS NULL
        AND lower(l.country_code) = t.slug
    );
END;
$$;
DROP TRIGGER IF EXISTS tr_sync_location_taxonomy_terms ON public.locations;
CREATE TRIGGER tr_sync_location_taxonomy_terms
AFTER INSERT OR UPDATE OR DELETE ON public.locations
FOR EACH STATEMENT
EXECUTE FUNCTION public.sync_location_taxonomy_terms();
-- Initial sync for existing rows
SELECT public.sync_location_taxonomy_terms();
COMMIT;
