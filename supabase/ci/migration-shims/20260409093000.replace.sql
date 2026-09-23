-- REPLACEMENT for 20260409093000_locations_taxonomy_sync.sql
--
-- WHY THE ORIGINAL CANNOT APPLY FROM SCRATCH — ANYWHERE, EVER
--   The file declares public.sync_location_taxonomy_terms() as RETURNS VOID
--   and then runs
--       CREATE TRIGGER tr_sync_location_taxonomy_terms
--         AFTER INSERT OR UPDATE OR DELETE ON public.locations
--         FOR EACH STATEMENT
--         EXECUTE FUNCTION public.sync_location_taxonomy_terms();
--   PostgreSQL rejects that at CREATE TRIGGER on every version (measured on
--   PostgreSQL 16.13):
--       ERROR:  function public.sync_location_taxonomy_terms must return type trigger
--   A trigger function must return `trigger`, and no pre-shim can supply one:
--   a `()` function cannot be overloaded on return type, and pre-creating it as
--   RETURNS trigger only moves the failure to the file's own first statement —
--       ERROR:  cannot change return type of existing function
--       HINT:  Use DROP FUNCTION sync_location_taxonomy_terms() first.
--   The whole file is one transaction, so a post-shim never runs either. This
--   is not a CI artifact: the statement is impossible, and was impossible when
--   it was pushed.
--
-- WHAT PRODUCTION ACTUALLY HOLDS
--   The function, as RETURNS void, and no trigger.
--   Evidence:
--     - web/src/lib/supabase/database.types.ts (generated FROM production)
--       line 21261: `sync_location_taxonomy_terms: { Args: never; Returns:
--       undefined }` — the void-returning function exists there.
--     - `tr_sync_location_taxonomy_terms` appears nowhere in the repo outside
--       this migration and this shim (grep over supabase/ and web/).
--     - 20260615211200_ml_taxonomy_bio_services_i18n.sql:790 later redefines
--       the same function with CREATE OR REPLACE ... RETURNS void, which would
--       have errored had anything created it as a trigger function.
--   Production records 20260409093000 as applied, so its ledger was repaired by
--   hand at this point: the CREATE TRIGGER never ran there either.
--
-- WHAT THIS FILE REPRODUCES
--   The original file with exactly two statements removed — the DROP TRIGGER
--   IF EXISTS and the CREATE TRIGGER. Everything else, including comments and
--   the transaction wrapper, is copied verbatim: same function definition, same
--   signature, same body, same initial `SELECT public.sync_location_taxonomy_
--   terms()` sync, so the end state is production's.
--   Verify with:
--     diff <(sed '/^DROP TRIGGER IF EXISTS tr_sync/,/^EXECUTE FUNCTION public.sync_location_taxonomy_terms();$/d' \
--               supabase/migrations/20260409093000_locations_taxonomy_sync.sql) \
--            <(sed -n '/^-- Single source of truth for locations:/,$p' \
--               supabase/ci/migration-shims/20260409093000.replace.sql)
--
--   The one behavioural difference from a world where the trigger existed:
--   changes to public.locations do not auto-sync public.taxonomy_terms. That is
--   also true in production, which is the point.

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
-- Initial sync for existing rows
SELECT public.sync_location_taxonomy_terms();
COMMIT;
