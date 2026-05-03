-- Taxonomy v2 — follow-up: reattach 8 legacy talent_type rows missed by the
-- initial reattachment in 20260801120410.
--
-- Found via post-migration audit: these legacy slugs from the pre-v2
-- taxonomy import had live talent_profile_taxonomy assignments but no
-- parent_id was set, so descendants_of(parent_category) doesn't include
-- them. Fixed in place — IDs unchanged, assignments unchanged.
--
-- Mapping rationale:
--   commercial-model → commercial-models      (canonical home for the role)
--   showroom-model   → commercial-models      (showroom is a commercial use case)
--   event-model      → promotional-models     (event-staffed promo work)
--   luxury-model     → specialty-models       (premium brand work, specialty tier)
--   actor            → stage-show-acts        (closest existing fit under Performers)
--   musician         → musicians              (canonical home for the role)
--   mascot-performer → specialty-performers   (performance act)
--   athlete-talent   → general-dancers        (fallback under Performers — no
--                                              dedicated category_group; product
--                                              can move it later if needed)

BEGIN;

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

UPDATE public.taxonomy_terms SET parent_id = public.taxv1_uuid('category_group','commercial-models'),    level = 3 WHERE kind='talent_type' AND slug = 'commercial-model'    AND parent_id IS NULL;
UPDATE public.taxonomy_terms SET parent_id = public.taxv1_uuid('category_group','commercial-models'),    level = 3 WHERE kind='talent_type' AND slug = 'showroom-model'      AND parent_id IS NULL;
UPDATE public.taxonomy_terms SET parent_id = public.taxv1_uuid('category_group','promotional-models'),   level = 3 WHERE kind='talent_type' AND slug = 'event-model'         AND parent_id IS NULL;
UPDATE public.taxonomy_terms SET parent_id = public.taxv1_uuid('category_group','specialty-models'),     level = 3 WHERE kind='talent_type' AND slug = 'luxury-model'        AND parent_id IS NULL;
UPDATE public.taxonomy_terms SET parent_id = public.taxv1_uuid('category_group','stage-show-acts'),      level = 3 WHERE kind='talent_type' AND slug = 'actor'               AND parent_id IS NULL;
UPDATE public.taxonomy_terms SET parent_id = public.taxv1_uuid('category_group','musicians'),            level = 3 WHERE kind='talent_type' AND slug = 'musician'            AND parent_id IS NULL;
UPDATE public.taxonomy_terms SET parent_id = public.taxv1_uuid('category_group','specialty-performers'), level = 3 WHERE kind='talent_type' AND slug = 'mascot-performer'    AND parent_id IS NULL;
UPDATE public.taxonomy_terms SET parent_id = public.taxv1_uuid('category_group','general-dancers'),      level = 3 WHERE kind='talent_type' AND slug = 'athlete-talent'      AND parent_id IS NULL;

COMMIT;
