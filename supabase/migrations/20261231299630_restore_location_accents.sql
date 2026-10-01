-- Restore accents lost from public.locations.display_name_i18n.
--
-- Audit 2026-09-30 (156 rows): the only accent-folded row was MX/cancun
-- ({en:"Cancun", es:"Cancun"}; original seed: "Cancún"). Cause: dev seeds
-- (seed_demo_profiles.sql, seed_runtime_smoke.sql) upserted ASCII "Cancun"
-- with ON CONFLICT DO UPDATE; the later display_name_i18n backfill carried it.
-- Seeds are fixed in the same commit.
--
-- Additive + idempotent: touches only display_name_i18n (en/es) of rows whose
-- value still differs, and the mirrored location_city taxonomy term. Slugs
-- are never changed. Safe to re-run.
BEGIN;

WITH fix(country_code, city_slug, name_en, name_es) AS (
  VALUES
    ('MX', 'cancun', 'Cancún', 'Cancún')
)
UPDATE public.locations l
SET display_name_i18n = l.display_name_i18n
      || jsonb_build_object('en', f.name_en, 'es', f.name_es),
    updated_at = now()
FROM fix f
WHERE l.country_code = f.country_code
  AND l.city_slug = f.city_slug
  AND (l.display_name_i18n->>'en' IS DISTINCT FROM f.name_en
    OR l.display_name_i18n->>'es' IS DISTINCT FROM f.name_es);

UPDATE public.taxonomy_terms t
SET name_i18n = t.name_i18n || jsonb_build_object('en', 'Cancún', 'es', 'Cancún'),
    updated_at = now()
WHERE t.kind = 'location_city'::public.taxonomy_kind
  AND t.slug = 'cancun'
  AND (t.name_i18n->>'en' IS DISTINCT FROM 'Cancún'
    OR t.name_i18n->>'es' IS DISTINCT FROM 'Cancún');

COMMIT;
