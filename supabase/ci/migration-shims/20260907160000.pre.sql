-- 20260907160000_taxonomy_cleanup_v1 asserts, before it demotes anything, that
-- every role it retires an occasion-specific term INTO already exists and is
-- active. From scratch it aborts with
--     tax_cleanup_v1: new role slug "singer" (target for "wedding-singer")
--     not found or inactive — aborting
--
-- This is not a CI quirk, and the repo already says so. The later migration
-- 20261230001700_seed_assumed_canonical_roles.sql exists for exactly this and
-- explains it in full:
--     "Three are not [seeded]: plain `singer`, `presenter` and
--      `content-creator` exist in production as legacy kind='talent_type' rows
--      that predate the v2 seeds, and NO migration in this repo creates them.
--      20260801120410_taxonomy_v2_seed_category_groups.sql gives the game away
--      at lines 167 and 170, where it re-parents `singer` and
--      `content-creator` with a bare UPDATE — a statement that quietly does
--      nothing when the row is absent."
-- 20261230001700 sorts ~4 months after 20260907160000, so in a version-ordered
-- replay it arrives far too late to unblock it.
--
-- THE MINIMAL ROWS, AND NOTHING ELSE
-- The statement below is 20261230001700's own INSERT, unchanged — same three
-- slugs, same deterministic taxv1_uuid ids, same parent groups, same
-- WHERE NOT EXISTS guard. Seeding them here rather than there puts them in
-- place before the first migration that needs them; when 20261230001700 itself
-- runs later in the replay its INSERT finds them and is a no-op, exactly as it
-- is on production. No other row is invented: the other thirteen assertion
-- targets are seeded by 20260801120420/120430, which have already run.
--
-- `public.taxv1_uuid` and the three category groups come from
-- 20260801120400..120460, all of which sort before this migration.
INSERT INTO public.taxonomy_terms
  (id, kind, term_type, level, slug, name_i18n, sort_order, is_active, is_profile_badge, parent_id)
SELECT public.taxv1_uuid('talent_type', v.slug),
       'talent_type', 'talent_type', 3,
       v.slug, jsonb_build_object('en', v.name_en, 'es', v.name_es), v.sort_order, TRUE, TRUE,
       public.taxv1_uuid('category_group', v.group_slug)
  FROM (VALUES
    ('singer',          'Singer',          'Cantante',              5, 'singers'),
    ('presenter',       'Presenter',       'Presentador',           5, 'mcs-presenters'),
    ('content-creator', 'Content Creator', 'Creador de Contenido',  5, 'content-creators')
  ) AS v(slug, name_en, name_es, sort_order, group_slug)
 WHERE NOT EXISTS (
   SELECT 1 FROM public.taxonomy_terms t WHERE t.slug = v.slug
 )
   AND EXISTS (
     SELECT 1 FROM public.taxonomy_terms g
      WHERE g.id = public.taxv1_uuid('category_group', v.group_slug)
        AND g.term_type = 'category_group'
   );
