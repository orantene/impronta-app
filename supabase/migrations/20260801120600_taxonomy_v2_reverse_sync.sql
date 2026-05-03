-- Taxonomy v2 — reverse-sync trigger.
--
-- PR 1 set up forward triggers on the canonical tables that refresh the
-- denormalized cache columns on talent_profiles:
--   talent_languages       → talent_profiles.languages    TEXT[]
--   talent_service_areas   → talent_profiles.destinations TEXT[]
--                          + talent_profiles.location_id (mirrors home_base)
--
-- This was one-way. The audit found that legacy code paths (M8 admin
-- editorial form, prototype internal state) still write to the cache
-- columns directly. Those edits were silently dropped from the canonical
-- tables — the canonical view drifts.
--
-- This migration adds the reverse direction: when talent_profiles.languages,
-- talent_profiles.destinations, or talent_profiles.location_id is updated
-- directly, sync the change BACK to the canonical tables.
--
-- Loop prevention: pg_trigger_depth() check. The forward triggers fire an
-- UPDATE on talent_profiles which would re-fire the reverse trigger. We
-- only act at the outermost trigger depth (= 1) — nested cascades are
-- skipped, which means a forward-trigger-driven cache refresh does not
-- re-write the canonical tables.
--
-- DOWN (manual):
--   DROP TRIGGER IF EXISTS trg_talent_profiles_reverse_sync_v2 ON public.talent_profiles;
--   DROP FUNCTION IF EXISTS public.talent_profiles_reverse_sync_v2();

BEGIN;

CREATE OR REPLACE FUNCTION public.talent_profiles_reverse_sync_v2()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant UUID;
BEGIN
  -- Only fire at the outermost trigger depth. If this UPDATE was issued by
  -- one of the forward cache-refresh triggers (depth >= 2), skip.
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  v_tenant := COALESCE(NEW.created_by_agency_id, '00000000-0000-0000-0000-000000000001'::UUID);

  ---------------------------------------------------------------------
  -- talent_profiles.location_id → talent_service_areas (home_base)
  ---------------------------------------------------------------------
  IF NEW.location_id IS DISTINCT FROM OLD.location_id THEN
    -- Drop any existing home_base row that no longer matches.
    DELETE FROM public.talent_service_areas
     WHERE talent_profile_id = NEW.id
       AND service_kind = 'home_base'
       AND (NEW.location_id IS NULL OR location_id <> NEW.location_id);

    -- Upsert the new home_base row when the new location_id is non-NULL.
    IF NEW.location_id IS NOT NULL THEN
      INSERT INTO public.talent_service_areas
        (tenant_id, talent_profile_id, location_id, service_kind, display_order)
      VALUES
        (v_tenant, NEW.id, NEW.location_id, 'home_base', 0)
      ON CONFLICT (talent_profile_id, location_id, service_kind) DO NOTHING;
    END IF;
  END IF;

  ---------------------------------------------------------------------
  -- talent_profiles.languages TEXT[] → talent_languages rows
  --
  -- For each language NAME in the new array, ensure a talent_languages
  -- row exists. Resolve the ISO 639-1 code via taxonomy_terms (kind=
  -- 'language') case-insensitive name match. If no match found, derive
  -- a fallback code from the first three letters of the name.
  -- Conservative: never DELETE rows from talent_languages here — a row
  -- in the canonical table is treated as the authoritative state and
  -- only the M8 form can grow it via this trigger.
  ---------------------------------------------------------------------
  IF NEW.languages IS DISTINCT FROM OLD.languages
     AND NEW.languages IS NOT NULL THEN
    INSERT INTO public.talent_languages
      (tenant_id, talent_profile_id, language_code, language_name,
       speaking_level, display_order)
    SELECT
      v_tenant,
      NEW.id,
      COALESCE(
        (SELECT lower(tt.slug) FROM public.taxonomy_terms tt
          WHERE tt.kind::text = 'language'
            AND (
              lower(tt.name_en) = lower(btrim(name))
              OR lower(COALESCE(tt.name_es, '')) = lower(btrim(name))
              OR lower(btrim(name)) = ANY(SELECT lower(a) FROM unnest(tt.aliases) a)
            )
          LIMIT 1),
        lower(left(regexp_replace(btrim(name), '[^a-zA-Z]', '', 'g'), 3))
      )                                                          AS language_code,
      COALESCE(
        (SELECT tt.name_en FROM public.taxonomy_terms tt
          WHERE tt.kind::text = 'language'
            AND (
              lower(tt.name_en) = lower(btrim(name))
              OR lower(COALESCE(tt.name_es, '')) = lower(btrim(name))
              OR lower(btrim(name)) = ANY(SELECT lower(a) FROM unnest(tt.aliases) a)
            )
          LIMIT 1),
        btrim(name)
      )                                                          AS language_name,
      'conversational',
      ord - 1
      FROM unnest(NEW.languages) WITH ORDINALITY AS u(name, ord)
     WHERE btrim(name) <> ''
    ON CONFLICT (talent_profile_id, language_code) DO NOTHING;
  END IF;

  ---------------------------------------------------------------------
  -- talent_profiles.destinations TEXT[] → talent_service_areas (travel_to)
  --
  -- Resolve each destination string against public.locations (display_name
  -- or city_slug). Add as travel_to rows. Skip strings that don't match a
  -- locations row (no fallback row creation — admins curate locations).
  -- Skip duplicates of home_base.
  ---------------------------------------------------------------------
  IF NEW.destinations IS DISTINCT FROM OLD.destinations
     AND NEW.destinations IS NOT NULL THEN
    INSERT INTO public.talent_service_areas
      (tenant_id, talent_profile_id, location_id, service_kind, display_order)
    SELECT
      v_tenant,
      NEW.id,
      loc.id,
      'travel_to',
      ord - 1
      FROM unnest(NEW.destinations) WITH ORDINALITY AS u(raw, ord)
      JOIN public.locations loc
        ON loc.archived_at IS NULL
       AND (
            lower(loc.display_name_en) = lower(btrim(raw))
            OR lower(COALESCE(loc.display_name_es, '')) = lower(btrim(raw))
            OR lower(loc.city_slug) = lower(regexp_replace(btrim(raw), '\s+', '-', 'g'))
       )
     WHERE btrim(raw) <> ''
       AND (NEW.location_id IS NULL OR loc.id <> NEW.location_id)
    ON CONFLICT (talent_profile_id, location_id, service_kind) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_talent_profiles_reverse_sync_v2 ON public.talent_profiles;

CREATE TRIGGER trg_talent_profiles_reverse_sync_v2
  AFTER UPDATE OF languages, destinations, location_id
  ON public.talent_profiles
  FOR EACH ROW
  WHEN (pg_trigger_depth() = 0)
  EXECUTE FUNCTION public.talent_profiles_reverse_sync_v2();

COMMENT ON FUNCTION public.talent_profiles_reverse_sync_v2() IS
  'Reverse cache → canonical sync. Pairs with the forward refresh triggers on talent_languages and talent_service_areas. The pg_trigger_depth() guard breaks the loop: forward triggers UPDATE talent_profiles at depth=2, which the WHEN clause rejects, so the reverse trigger only fires for direct app writes.';

COMMIT;
