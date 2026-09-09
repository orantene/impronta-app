-- Un-flatten taxonomy_terms.term_type, and stop the column flattening itself.
--
-- WHAT IS WRONG. `taxonomy_terms.term_type` is one of the columns no migration
-- in this repo creates (it is in the hand-applied set the isolated audit
-- reports), and wherever it was created by hand it was created as
--
--     term_type text NOT NULL DEFAULT 'attribute'
--
-- while `20260801120000_taxonomy_v2_hierarchy_columns.sql` adds it as a plain
-- nullable `TEXT` and then backfills it from `kind`:
--
--     talent_type -> talent_type   skill    -> skill
--     event_type  -> context       industry -> context
--     fit_label   -> attribute     tag      -> attribute
--     language    -> language      location_* -> attribute
--
-- That backfill is written `WHERE term_type IS NULL`. With the hand-applied
-- default, term_type is NEVER null — every row arrives already stamped
-- 'attribute' — so the backfill matches nothing and the mapping never happens.
-- On the isolated QA branch all 102 terms read 'attribute': 16 talent types,
-- 16 skills, 16 event types, 15 industries and 8 languages, all of them
-- flattened into one bucket.
--
-- WHAT IT COSTS. The reading code does not fall back. `isTalentTypeTerm`
-- checks `term_type === 'talent_type' || (!term_type && kind === 'talent_type')`
-- and 'attribute' is not falsy, so the legacy leg never fires;
-- `directory-category-tree` selects
-- `term_type IN ('parent_category','category_group','talent_type')` and
-- `engine.ts` filters `.eq('term_type','parent_category')`. A flattened
-- taxonomy therefore returns an EMPTY category tree with no error anywhere —
-- the directory simply has no categories, and nothing says why.
--
-- It also blocks the schema. 20260801120000 finishes by adding
-- `UNIQUE (term_type, slug)`, and once every kind shares one term_type,
-- distinct terms collide: 'fitness' exists as a skill and as an industry,
-- 'brand-activation' as a skill and an event type. The constraint cannot be
-- built, so that migration fails as a whole — taking `level`, `is_active`,
-- `is_public_filter` and eight more columns with it, which is why the field
-- engine logs `column taxonomy_terms.is_active does not exist` on every admin
-- request. Downstream, `field_architecture_v1` asserts ≥100 parent-category
-- mappings, finds 0, and rolls back; without its tables
-- `public_listing_single_gate` cannot create its triggers; without those
-- `appointments_v1` cannot build `talent_discover_index`. One default, ten
-- migrations.
--
-- WHAT THIS DOES. Three steps, each a no-op on a database that was built from
-- the migrations and is already correct:
--   1. Drop the default, so no future insert flattens a term again.
--   2. Re-derive term_type from kind, but ONLY for rows still sitting on the
--      flattened value whose kind maps somewhere else. A row whose kind really
--      does map to 'attribute' (fit_label, tag, location_*) is left alone, and
--      no row that already carries a v2 type is touched.
--   3. Add the UNIQUE (term_type, slug) constraint if it is missing — it is
--      missing precisely where step 2 was needed — after checking that the
--      remapped data can carry it. If a duplicate survives, RAISE with the
--      pairs named: which of two same-named terms to keep is a decision for a
--      human, not for a migration.
--
-- Deliberately NOT here: the eleven columns and the indexes. Those belong to
-- 20260801120000, which can succeed once its constraint is buildable.

BEGIN;

ALTER TABLE public.taxonomy_terms
  ALTER COLUMN term_type DROP DEFAULT;

UPDATE public.taxonomy_terms AS t
   SET term_type = m.target
  FROM (
    SELECT id,
           CASE kind::text
             WHEN 'talent_type'      THEN 'talent_type'
             WHEN 'skill'            THEN 'skill'
             WHEN 'event_type'       THEN 'context'
             WHEN 'industry'         THEN 'context'
             WHEN 'fit_label'        THEN 'attribute'
             WHEN 'tag'              THEN 'attribute'
             WHEN 'language'         THEN 'language'
             WHEN 'location_city'    THEN 'attribute'
             WHEN 'location_country' THEN 'attribute'
             ELSE 'attribute'
           END AS target
      FROM public.taxonomy_terms
  ) AS m
 WHERE m.id = t.id
   AND t.term_type = 'attribute'
   AND m.target <> 'attribute';

DO $$
DECLARE
  v_dupes text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'taxonomy_terms_term_type_slug_uniq'
       AND conrelid = 'public.taxonomy_terms'::regclass
  ) THEN
    RETURN;
  END IF;

  SELECT string_agg(format('%s/%s ×%s', term_type, slug, n), ', ')
    INTO v_dupes
    FROM (
      SELECT term_type, slug, count(*) AS n
        FROM public.taxonomy_terms
       GROUP BY term_type, slug
      HAVING count(*) > 1
    ) d;

  IF v_dupes IS NOT NULL THEN
    RAISE EXCEPTION
      'taxonomy_terms still has duplicate (term_type, slug) after remapping: %. '
      'Merge or archive one of each pair by hand — a migration must not choose '
      'which term survives.', v_dupes;
  END IF;

  ALTER TABLE public.taxonomy_terms
    ADD CONSTRAINT taxonomy_terms_term_type_slug_uniq UNIQUE (term_type, slug);
END $$;

COMMENT ON COLUMN public.taxonomy_terms.term_type IS
  'v2 hierarchical type. Derived from the legacy kind for pre-v2 rows. Has no '
  'default on purpose: a default flattens every new term into one bucket and '
  'the readers do not fall back to kind when term_type is non-null.';

COMMIT;
