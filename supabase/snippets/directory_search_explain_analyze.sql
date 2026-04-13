-- Run in Supabase SQL editor (or psql) against a copy / staging with realistic row counts.
-- Goal: confirm GIN FTS, trigram, partial indexes, and seq scans where expected.

-- 1) q only (FTS + ILIKE + similarity branches inside function)
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT * FROM public.directory_search_public_talent_ids('maria');

-- 2) Fuzzy / typo-style token (trigram similarity path)
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT * FROM public.directory_search_public_talent_ids('mraia');

-- 3) City-style token (location join)
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT * FROM public.directory_search_public_talent_ids('cancun');

-- 4) Taxonomy / tag style (replace with a real slug fragment from your seed)
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT * FROM public.directory_search_public_talent_ids('hostess');

-- 5) Mixed intent
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT * FROM public.directory_search_public_talent_ids('bilingual hostess cancun');

-- 6) Profile code exact-ish (often hits ILIKE on profile_code + FTS)
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT * FROM public.directory_search_public_talent_ids('IMP-0001');

-- 7) Public list sort hot paths (no search) — verify partial indexes
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT id
FROM public.talent_profiles
WHERE deleted_at IS NULL
  AND workflow_status = 'approved'
  AND visibility = 'public'
ORDER BY is_featured DESC,
         featured_level DESC,
         featured_position ASC,
         updated_at DESC,
         created_at DESC,
         id DESC
LIMIT 24;

EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT id
FROM public.talent_profiles
WHERE deleted_at IS NULL
  AND workflow_status = 'approved'
  AND visibility = 'public'
ORDER BY created_at DESC, id DESC
LIMIT 24;

-- 8) Intersection pattern: search ids ∩ taxonomy (similar to app `.in('id', ids)`)
-- Replace :term and :term_id with literals from your DB.
-- EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
-- SELECT tp.id
-- FROM public.talent_profiles tp
-- WHERE tp.deleted_at IS NULL
--   AND tp.workflow_status = 'approved'
--   AND tp.visibility = 'public'
--   AND tp.id IN (SELECT directory_search_public_talent_ids('maria'))
--   AND EXISTS (
--     SELECT 1 FROM public.talent_profile_taxonomy tpt
--     WHERE tpt.talent_profile_id = tp.id
--       AND tpt.taxonomy_term_id = '00000000-0000-0000-0000-000000000000'::uuid
--   )
-- ORDER BY tp.is_featured DESC, tp.featured_level DESC, tp.featured_position ASC,
--          tp.updated_at DESC, tp.created_at DESC, tp.id DESC
-- LIMIT 24 OFFSET 0;
