-- Audit and merge duplicate active field groups by visible label.
-- Run in Supabase SQL Editor as a privileged role after reviewing results.

-- 1) Audit duplicate active groups by English label.
WITH active_groups AS (
  SELECT
    id,
    slug,
    name_en,
    name_es,
    sort_order,
    archived_at
  FROM public.field_groups
  WHERE archived_at IS NULL
),
dupes AS (
  SELECT lower(btrim(name_en)) AS normalized_name_en
  FROM active_groups
  GROUP BY 1
  HAVING COUNT(*) > 1
)
SELECT
  g.id,
  g.slug,
  g.name_en,
  g.name_es,
  g.sort_order,
  COUNT(fd.id) AS attached_definitions
FROM active_groups g
JOIN dupes d
  ON d.normalized_name_en = lower(btrim(g.name_en))
LEFT JOIN public.field_definitions fd
  ON fd.field_group_id = g.id
 AND fd.archived_at IS NULL
GROUP BY g.id, g.slug, g.name_en, g.name_es, g.sort_order
ORDER BY lower(btrim(g.name_en)), g.sort_order, g.slug;

-- 2) Canonical-candidate preview.
-- Strategy:
-- - keep the lowest sort_order active group
-- - tie-break by slug
-- - migrate attached field_definitions to that canonical group
WITH ranked AS (
  SELECT
    id,
    slug,
    name_en,
    sort_order,
    ROW_NUMBER() OVER (
      PARTITION BY lower(btrim(name_en))
      ORDER BY sort_order ASC, slug ASC
    ) AS rank_in_label
  FROM public.field_groups
  WHERE archived_at IS NULL
)
SELECT *
FROM ranked
WHERE lower(btrim(name_en)) IN (
  SELECT lower(btrim(name_en))
  FROM public.field_groups
  WHERE archived_at IS NULL
  GROUP BY 1
  HAVING COUNT(*) > 1
)
ORDER BY lower(btrim(name_en)), rank_in_label;

-- 3) Example merge template.
-- Current recommended canonical groups from the latest audit:
-- - keep `availability_mobility`, archive `suitability`
-- - keep `basic_info`, archive `location`
-- - keep `abilities`, archive `languages`
--
-- BEGIN;
--
-- WITH canonical AS (
--   SELECT id
--   FROM public.field_groups
--   WHERE slug = 'availability_mobility'
--     AND archived_at IS NULL
--   LIMIT 1
-- ),
-- duplicate AS (
--   SELECT id
--   FROM public.field_groups
--   WHERE slug = 'suitability'
--     AND archived_at IS NULL
--   LIMIT 1
-- )
-- UPDATE public.field_definitions
-- SET
--   field_group_id = (SELECT id FROM canonical),
--   updated_at = now()
-- WHERE field_group_id = (SELECT id FROM duplicate);
--
-- UPDATE public.field_groups
-- SET
--   archived_at = now(),
--   updated_at = now()
-- WHERE id = (SELECT id FROM duplicate);
--
-- COMMIT;

-- 4) Ready-to-run merge plan for the duplicates reported on 2026-04-09.
-- Review each block, then run them one at a time or together in a single transaction.
--
-- BEGIN;
--
-- -- A) Availability & Mobility: keep `availability_mobility`, archive `suitability`
-- WITH canonical AS (
--   SELECT id
--   FROM public.field_groups
--   WHERE id = '6e1b321e-03b2-4be0-a159-83f8d6e46ae6'
--     AND slug = 'availability_mobility'
--     AND archived_at IS NULL
--   LIMIT 1
-- ),
-- duplicate AS (
--   SELECT id
--   FROM public.field_groups
--   WHERE id = 'ac292400-8683-4474-8dbc-bb8593b2c5ff'
--     AND slug = 'suitability'
--     AND archived_at IS NULL
--   LIMIT 1
-- )
-- UPDATE public.field_definitions
-- SET
--   field_group_id = (SELECT id FROM canonical),
--   updated_at = now()
-- WHERE field_group_id = (SELECT id FROM duplicate);
--
-- UPDATE public.field_groups
-- SET
--   archived_at = now(),
--   updated_at = now()
-- WHERE id = 'ac292400-8683-4474-8dbc-bb8593b2c5ff';
--
-- -- B) Basic Information: keep `basic_info`, archive `location`
-- WITH canonical AS (
--   SELECT id
--   FROM public.field_groups
--   WHERE id = '8a1a974d-92d5-481c-8a50-000bbb54f9cb'
--     AND slug = 'basic_info'
--     AND archived_at IS NULL
--   LIMIT 1
-- ),
-- duplicate AS (
--   SELECT id
--   FROM public.field_groups
--   WHERE id = 'af22105d-94c8-4a28-aac6-180a84464fab'
--     AND slug = 'location'
--     AND archived_at IS NULL
--   LIMIT 1
-- )
-- UPDATE public.field_definitions
-- SET
--   field_group_id = (SELECT id FROM canonical),
--   updated_at = now()
-- WHERE field_group_id = (SELECT id FROM duplicate);
--
-- UPDATE public.field_groups
-- SET
--   archived_at = now(),
--   updated_at = now()
-- WHERE id = 'af22105d-94c8-4a28-aac6-180a84464fab';
--
-- -- C) Languages & Skills: keep `abilities`, archive `languages`
-- WITH canonical AS (
--   SELECT id
--   FROM public.field_groups
--   WHERE id = 'b2e31026-b265-4afa-b750-588911c4c8e5'
--     AND slug = 'abilities'
--     AND archived_at IS NULL
--   LIMIT 1
-- ),
-- duplicate AS (
--   SELECT id
--   FROM public.field_groups
--   WHERE id = '01646780-6255-45a1-9eaf-f210d2848bdd'
--     AND slug = 'languages'
--     AND archived_at IS NULL
--   LIMIT 1
-- )
-- UPDATE public.field_definitions
-- SET
--   field_group_id = (SELECT id FROM canonical),
--   updated_at = now()
-- WHERE field_group_id = (SELECT id FROM duplicate);
--
-- UPDATE public.field_groups
-- SET
--   archived_at = now(),
--   updated_at = now()
-- WHERE id = '01646780-6255-45a1-9eaf-f210d2848bdd';
--
-- COMMIT;
