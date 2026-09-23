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
-- 20261230001700 sorts ~4 months after 20260907160000, so a version-ordered
-- replay reaches it far too late to unblock anything.
--
-- THE MINIMAL ROWS, AND NOTHING ELSE
-- The three slugs, ids, parents and sort orders below are 20261230001700's
-- own, unchanged, including its WHERE NOT EXISTS guard and its refusal to
-- attach a role to a category group that is not there. Seeding them here puts
-- them in place before the first migration that needs them; when
-- 20261230001700 runs later in the replay its INSERT finds them and is a
-- no-op, exactly as it is on production. No other row is invented: the other
-- thirteen assertion targets are seeded by 20260801120420/120430, which have
-- already run. `public.taxv1_uuid` and the three category groups come from
-- 20260801120400..120460, all of which sort before this migration.
--
-- WHY THE COLUMN SHAPE IS CHOSEN AT RUNTIME
-- 20261230001700 writes `name_i18n`, the jsonb map that
-- 20260615211200_ml_taxonomy_bio_services_i18n folds name_en / name_es into.
-- That fold sorts BEFORE this migration but cannot apply until
-- 20260907200000 exists (it needs parent_category_of()), which in turn needs
-- this migration — so at this point in the replay taxonomy_terms is still in
-- its name_en / name_es shape, while on a database where the fold already
-- happened it is not. The insert below picks whichever shape the table
-- actually has; the values written are identical either way, and the fold
-- migration converts them when it finally applies.
DO $$
DECLARE
  has_i18n boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'taxonomy_terms'
       AND column_name = 'name_i18n'
  ) INTO has_i18n;

  IF has_i18n THEN
    EXECUTE $q$
      INSERT INTO public.taxonomy_terms
        (id, kind, term_type, level, slug, name_i18n, sort_order, is_active, is_profile_badge, parent_id)
      SELECT public.taxv1_uuid('talent_type', v.slug),
             'talent_type', 'talent_type', 3,
             v.slug, jsonb_build_object('en', v.name_en, 'es', v.name_es),
             v.sort_order, TRUE, TRUE,
             public.taxv1_uuid('category_group', v.group_slug)
        FROM (VALUES
          ('singer',          'Singer',          'Cantante',              5, 'singers'),
          ('presenter',       'Presenter',       'Presentador',           5, 'mcs-presenters'),
          ('content-creator', 'Content Creator', 'Creador de Contenido',  5, 'content-creators')
        ) AS v(slug, name_en, name_es, sort_order, group_slug)
       WHERE NOT EXISTS (SELECT 1 FROM public.taxonomy_terms t WHERE t.slug = v.slug)
         AND EXISTS (
           SELECT 1 FROM public.taxonomy_terms g
            WHERE g.id = public.taxv1_uuid('category_group', v.group_slug)
              AND g.term_type = 'category_group')
    $q$;
  ELSE
    EXECUTE $q$
      INSERT INTO public.taxonomy_terms
        (id, kind, term_type, level, slug, name_en, name_es, sort_order, is_active, is_profile_badge, parent_id)
      SELECT public.taxv1_uuid('talent_type', v.slug),
             'talent_type', 'talent_type', 3,
             v.slug, v.name_en, v.name_es,
             v.sort_order, TRUE, TRUE,
             public.taxv1_uuid('category_group', v.group_slug)
        FROM (VALUES
          ('singer',          'Singer',          'Cantante',              5, 'singers'),
          ('presenter',       'Presenter',       'Presentador',           5, 'mcs-presenters'),
          ('content-creator', 'Content Creator', 'Creador de Contenido',  5, 'content-creators')
        ) AS v(slug, name_en, name_es, sort_order, group_slug)
       WHERE NOT EXISTS (SELECT 1 FROM public.taxonomy_terms t WHERE t.slug = v.slug)
         AND EXISTS (
           SELECT 1 FROM public.taxonomy_terms g
            WHERE g.id = public.taxv1_uuid('category_group', v.group_slug)
              AND g.term_type = 'category_group')
    $q$;
  END IF;
END $$;
