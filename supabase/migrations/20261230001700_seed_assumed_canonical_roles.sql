-- Seed the three canonical roles the taxonomy corpus assumes and never creates.
--
-- WHAT IS WRONG. `20260907160000_taxonomy_cleanup_v1.sql` retires the
-- occasion-specific roles into a role-plus-context pair, and asserts up front
-- that every target exists and is active:
--
--     ('wedding-singer',        'singer',          ARRAY['weddings'])
--     ('bilingual-presenter',   'presenter',       ARRAY[]::TEXT[])
--     ('content-creator-generic','content-creator', ARRAY[]::TEXT[])
--
-- Thirteen of its sixteen targets are seeded by
-- `20260801120420/120430_taxonomy_v2_seed_talent_types_*.sql` — `dj`,
-- `live-band`, `event-photographer`, `event-videographer`, `fashion-model`,
-- `master-of-ceremonies`, `handyman` and the rest. Three are not: plain
-- `singer`, `presenter` and `content-creator` exist in production as legacy
-- `kind='talent_type'` rows that predate the v2 seeds, and NO migration in
-- this repo creates them. `20260801120410_taxonomy_v2_seed_category_groups.sql`
-- gives the game away at lines 167 and 170, where it re-parents `singer` and
-- `content-creator` with a bare `UPDATE` — a statement that quietly does
-- nothing when the row is absent.
--
-- WHAT IT COSTS. `taxonomy_cleanup_v1` raises
-- `new role slug "singer" (target for "wedding-singer") not found or inactive
-- — aborting` and rolls back in full, so its two columns
-- (`taxonomy_terms.is_generic_fallback`, `is_visible_by_default`) never exist.
-- `is_generic_fallback` is not decorative: `talent-self-services.ts` and
-- `admin-talent-skills.ts` SELECT it on every skill and context read and
-- filter `.eq("is_generic_fallback", false)`, so on a database built from this
-- repo the talent "My services" surfaces fail with `column
-- taxonomy_terms.is_generic_fallback does not exist`. Downstream,
-- `multi_skill_talent_v1` needs the same columns.
--
-- WHY SEED RATHER THAN SOFTEN THE ASSERTION. The assertion is right: silently
-- skipping a demotion would archive `wedding-singer` in §8 and leave the
-- talent tagged to an archived term. The missing thing is three rows.
--
-- Deterministic ids via `taxv1_uuid`, matching the seeds, so re-running is a
-- no-op and any later `taxv1_uuid('talent_type', …)` reference resolves. Each
-- row is inserted only when its slug is absent, so a database that already
-- has the legacy row (production) is untouched — including its id.

BEGIN;

-- `taxv1_uuid` is created by the v2 seed migrations, which run before this
-- one. Repeated here because a database repaired out of order may not have it
-- yet, and the definition is byte-identical.
CREATE OR REPLACE FUNCTION public.taxv1_uuid(p_term_type TEXT, p_slug TEXT)
RETURNS UUID LANGUAGE SQL IMMUTABLE AS $$
  SELECT (
    substr(md5('tulala/taxonomy/v1/' || p_term_type || '/' || p_slug), 1, 8) || '-' ||
    substr(md5('tulala/taxonomy/v1/' || p_term_type || '/' || p_slug), 9, 4) || '-' ||
    substr(md5('tulala/taxonomy/v1/' || p_term_type || '/' || p_slug), 13, 4) || '-' ||
    substr(md5('tulala/taxonomy/v1/' || p_term_type || '/' || p_slug), 17, 4) || '-' ||
    substr(md5('tulala/taxonomy/v1/' || p_term_type || '/' || p_slug), 21, 12)
  )::UUID;
$$;

-- 2026-09-10, met on production: this file was written against a column
-- shape that no longer exists. `name_en` and `name_es` were folded into one
-- `name_i18n` jsonb by 20260615211200, months before this file. It ran on the
-- isolated QA branch only because that branch carried the old columns out of
-- band; production refused it at plan time with 42703, so the eleven files
-- before it applied and everything after it waited. Rewritten to the real
-- shape. The three roles it seeds already exist on production, so the WHERE
-- NOT EXISTS makes this a no-op there; what had to change is that the
-- statement now parses.
INSERT INTO public.taxonomy_terms
  (id, kind, term_type, level, slug, name_i18n, sort_order, is_active, is_profile_badge, parent_id)
SELECT public.taxv1_uuid('talent_type', v.slug),
       'talent_type', 'talent_type', 3,
       v.slug, jsonb_build_object('en', v.name_en, 'es', v.name_es), v.sort_order, TRUE, TRUE,
       public.taxv1_uuid('category_group', v.group_slug)
  FROM (VALUES
    -- Sort orders put each canonical role FIRST in its group: it is the answer
    -- for a booker who does not want a sub-genre.
    ('singer',          'Singer',          'Cantante',              5, 'singers'),
    ('presenter',       'Presenter',       'Presentador',           5, 'mcs-presenters'),
    ('content-creator', 'Content Creator', 'Creador de Contenido',  5, 'content-creators')
  ) AS v(slug, name_en, name_es, sort_order, group_slug)
 WHERE NOT EXISTS (
   SELECT 1 FROM public.taxonomy_terms t WHERE t.slug = v.slug
 )
   -- Only when the parent group is really there. A level-3 role hanging off a
   -- missing group would be invisible in the category tree, which is worse
   -- than absent: absent raises, invisible does not.
   AND EXISTS (
     SELECT 1 FROM public.taxonomy_terms g
      WHERE g.id = public.taxv1_uuid('category_group', v.group_slug)
        AND g.term_type = 'category_group'
   );

DO $$
DECLARE
  v_missing text;
BEGIN
  SELECT string_agg(slug, ', ')
    INTO v_missing
    FROM (VALUES ('singer'), ('presenter'), ('content-creator')) AS v(slug)
   WHERE NOT EXISTS (
     SELECT 1 FROM public.taxonomy_terms t
      WHERE t.slug = v.slug AND t.is_active
   );

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION
      'canonical roles still absent or inactive after seeding: %. The v2 '
      'category groups (singers, mcs-presenters, content-creators) must exist '
      'first — run the 20260801120400..120460 seeds.', v_missing;
  END IF;
END $$;

COMMIT;
