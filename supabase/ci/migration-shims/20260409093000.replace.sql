-- REPLACEMENT for 20260409093000_locations_taxonomy_sync.sql
--
-- WHY THE ORIGINAL CANNOT APPLY FROM SCRATCH — ANYWHERE, EVER
--   The file declares public.sync_location_taxonomy_terms() as RETURNS VOID
--   and then runs
--       CREATE TRIGGER tr_sync_location_taxonomy_terms
--         AFTER INSERT OR UPDATE OR DELETE ON public.locations
--         FOR EACH STATEMENT
--         EXECUTE FUNCTION public.sync_location_taxonomy_terms();
--   PostgreSQL rejects that at CREATE TRIGGER on every version:
--       ERROR: function public.sync_location_taxonomy_terms must return type trigger
--   A trigger function must return `trigger`, and a `()` function cannot be
--   overloaded on return type, so no pre-shim can supply a second, trigger-
--   returning definition. The whole file is one transaction, so a post-shim
--   never runs. This is not a CI artifact: the statement is impossible.
--
-- WHAT PRODUCTION ACTUALLY HOLDS
--   The function, as RETURNS void — nothing else in supabase/migrations/
--   references `tr_sync_location_taxonomy_terms`, and two later migrations
--   (20260615211200_ml_taxonomy_bio_services_i18n,
--   20260904063118_revoke_anon_ensure_city_location) redefine the same
--   function, again as RETURNS void. Production records this version as
--   applied, which means the ledger was repaired by hand at this point and the
--   trigger was never created there either.
--
-- WHAT THIS FILE REPRODUCES
--   Byte-for-byte the original file MINUS the two impossible statements
--   (DROP TRIGGER IF EXISTS / CREATE TRIGGER). The function definition and the
--   initial `SELECT public.sync_location_taxonomy_terms()` sync are unchanged,
--   so the end state matches production exactly: same function, same signature,
--   same body, same initial taxonomy rows, no trigger.
--
--   The difference from production that this DOES leave: locations changes do
--   not auto-sync taxonomy_terms. That is true in production too.

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

-- Initial sync for existing rows (unchanged from the original).
SELECT public.sync_location_taxonomy_terms();
