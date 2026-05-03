-- Taxonomy v2 — seed step 1 of N: parent_categories + helper + existing-row
-- upgrade.
--
-- Parent categories are the top-level marketplace taxonomy (level 1). This
-- migration:
--   1. Defines a temp helper for deterministic UUIDs derived from MD5 of the
--      term_type + slug. Re-runs of the seed produce the same UUIDs.
--   2. Inserts all 19 parent_categories.
--   3. Upgrades existing taxonomy_terms rows (kind='talent_type' or 'skill')
--      that are still flat into the new hierarchy: sets term_type, level,
--      and parent_id where the existing slug maps cleanly.
--
-- Subsequent migrations (20260801120410+) seed category_groups, talent_types,
-- specialties, skills, and contexts. They all rely on the deterministic UUIDs
-- defined here.
--
-- DOWN (manual):
--   DELETE FROM public.taxonomy_terms
--    WHERE term_type = 'parent_category';
--   UPDATE public.taxonomy_terms
--      SET parent_id = NULL, level = 1
--    WHERE updated_at >= '2026-08-01';

BEGIN;

-- Deterministic UUID helper. Stable across runs; safe in transactions.
CREATE OR REPLACE FUNCTION public.taxv1_uuid(p_term_type TEXT, p_slug TEXT)
RETURNS UUID
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT (
    substr(md5('tulala/taxonomy/v1/' || p_term_type || '/' || p_slug), 1, 8) || '-' ||
    substr(md5('tulala/taxonomy/v1/' || p_term_type || '/' || p_slug), 9, 4) || '-' ||
    substr(md5('tulala/taxonomy/v1/' || p_term_type || '/' || p_slug), 13, 4) || '-' ||
    substr(md5('tulala/taxonomy/v1/' || p_term_type || '/' || p_slug), 17, 4) || '-' ||
    substr(md5('tulala/taxonomy/v1/' || p_term_type || '/' || p_slug), 21, 12)
  )::UUID;
$$;

-- ─── 19 parent_categories ──────────────────────────────────────────────────
-- kind='tag' (compatibility with existing UNIQUE(kind, slug) constraint).
-- term_type='parent_category' is the canonical v2 type.
-- is_public_filter=TRUE for the 8 marketplace top-bar categories;
-- the other 11 surface via the "More" rollup.
INSERT INTO public.taxonomy_terms (
  id, kind, term_type, level, slug, name_en, name_es, plural_name,
  sort_order, is_active, is_public_filter, is_profile_badge, parent_id,
  description
) VALUES
  (public.taxv1_uuid('parent_category','models'),                    'tag', 'parent_category', 1, 'models',                    'Models',                       'Modelos',                       'Models',                       10,  TRUE, TRUE,  TRUE, NULL, 'Fashion, commercial, promotional, content, and specialty models.'),
  (public.taxv1_uuid('parent_category','hosts-promo'),               'tag', 'parent_category', 1, 'hosts-promo',               'Hosts & Promo',                'Anfitriones y Promo',           'Hosts & Promo',                20,  TRUE, TRUE,  TRUE, NULL, 'Event hosts, hostesses, MCs, brand ambassadors, guest experience hosts.'),
  (public.taxv1_uuid('parent_category','performers'),                'tag', 'parent_category', 1, 'performers',                'Performers',                   'Artistas',                      'Performers',                   30,  TRUE, TRUE,  TRUE, NULL, 'Dancers, specialty performers, stage and show acts.'),
  (public.taxv1_uuid('parent_category','music-djs'),                 'tag', 'parent_category', 1, 'music-djs',                 'Music & DJs',                  'Música y DJs',                  'Music & DJs',                  40,  TRUE, TRUE,  TRUE, NULL, 'DJs, singers, musicians, bands and groups.'),
  (public.taxv1_uuid('parent_category','chefs-culinary'),            'tag', 'parent_category', 1, 'chefs-culinary',            'Chefs & Culinary',             'Chefs y Culinaria',             'Chefs & Culinary',             50,  TRUE, TRUE,  TRUE, NULL, 'Private chefs, cuisine specialists, pastry, beverage talent, culinary experiences.'),
  (public.taxv1_uuid('parent_category','wellness-beauty'),           'tag', 'parent_category', 1, 'wellness-beauty',           'Wellness & Beauty',            'Bienestar y Belleza',           'Wellness & Beauty',            60,  TRUE, TRUE,  TRUE, NULL, 'Massage, fitness, beauty services, holistic wellness experts.'),
  (public.taxv1_uuid('parent_category','photo-video-creative'),      'tag', 'parent_category', 1, 'photo-video-creative',      'Photo, Video & Creative',      'Foto, Video y Creativo',        'Photo, Video & Creative',      70,  TRUE, TRUE,  TRUE, NULL, 'Photography, video, creative direction, content production.'),
  (public.taxv1_uuid('parent_category','influencers-creators'),      'tag', 'parent_category', 1, 'influencers-creators',      'Influencers & Creators',       'Influencers y Creadores',       'Influencers & Creators',       80,  TRUE, TRUE,  TRUE, NULL, 'Influencers, content creators, brand collaborators.'),
  (public.taxv1_uuid('parent_category','event-staff'),               'tag', 'parent_category', 1, 'event-staff',               'Event Staff',                  'Personal de Eventos',           'Event Staff',                  90,  TRUE, FALSE, TRUE, NULL, 'Service staff, bar staff, guest operations, event operations, promotional staff.'),
  (public.taxv1_uuid('parent_category','hospitality-property'),      'tag', 'parent_category', 1, 'hospitality-property',      'Hospitality & Property',       'Hospitalidad y Propiedad',      'Hospitality & Property',       100, TRUE, FALSE, TRUE, NULL, 'Housekeeping, villa & estate staff, hotel & guest services, property maintenance.'),
  (public.taxv1_uuid('parent_category','travel-concierge'),          'tag', 'parent_category', 1, 'travel-concierge',          'Travel & Concierge',           'Viajes y Concierge',            'Travel & Concierge',           110, TRUE, FALSE, TRUE, NULL, 'Travel planning, concierge services, tours and experiences, local help.'),
  (public.taxv1_uuid('parent_category','transportation'),            'tag', 'parent_category', 1, 'transportation',            'Transportation',               'Transporte',                    'Transportation',               120, TRUE, FALSE, TRUE, NULL, 'Drivers, luxury transport, boats and marine, logistics.'),
  (public.taxv1_uuid('parent_category','home-technical-services'),   'tag', 'parent_category', 1, 'home-technical-services',   'Home & Technical Services',    'Servicios Domésticos y Técnicos','Home & Technical Services',   130, TRUE, FALSE, TRUE, NULL, 'Handyman, skilled trades, smart home and tech, property improvement.'),
  (public.taxv1_uuid('parent_category','security-protection'),       'tag', 'parent_category', 1, 'security-protection',       'Security & Protection',        'Seguridad y Protección',        'Security & Protection',        140, TRUE, FALSE, TRUE, NULL, 'Event security, personal protection, property security.'),
  (public.taxv1_uuid('parent_category','sports-fitness'),            'tag', 'parent_category', 1, 'sports-fitness',            'Sports & Fitness',             'Deportes y Fitness',            'Sports & Fitness',             150, TRUE, FALSE, TRUE, NULL, 'Fitness coaches, sports instructors, adventure sports.'),
  (public.taxv1_uuid('parent_category','kids-family-services'),      'tag', 'parent_category', 1, 'kids-family-services',      'Kids & Family Services',       'Niños y Familia',               'Kids & Family Services',       160, TRUE, FALSE, TRUE, NULL, 'Childcare, kids entertainment, family support.'),
  (public.taxv1_uuid('parent_category','speakers-coaches-experts'),  'tag', 'parent_category', 1, 'speakers-coaches-experts',  'Speakers, Coaches & Experts',  'Conferencistas, Coaches y Expertos','Speakers, Coaches & Experts', 170, TRUE, FALSE, TRUE, NULL, 'Speakers, coaches, educators and workshop leaders.'),
  (public.taxv1_uuid('parent_category','production-bts'),            'tag', 'parent_category', 1, 'production-bts',            'Production & Behind-the-Scenes','Producción y Tras Bambalinas',  'Production & Behind-the-Scenes',180,TRUE, FALSE, TRUE, NULL, 'Event production, technical crew, styling and wardrobe, set and decor.'),
  (public.taxv1_uuid('parent_category','animals-specialty-acts'),    'tag', 'parent_category', 1, 'animals-specialty-acts',    'Animals & Specialty Acts',     'Animales y Actos Especiales',   'Animals & Specialty Acts',     190, TRUE, FALSE, TRUE, NULL, 'Animal acts and event animals.')
ON CONFLICT (term_type, slug) DO UPDATE SET
  name_en          = EXCLUDED.name_en,
  name_es          = EXCLUDED.name_es,
  plural_name      = EXCLUDED.plural_name,
  level            = EXCLUDED.level,
  sort_order       = EXCLUDED.sort_order,
  is_active        = EXCLUDED.is_active,
  is_public_filter = EXCLUDED.is_public_filter,
  is_profile_badge = EXCLUDED.is_profile_badge,
  description      = EXCLUDED.description,
  parent_id        = EXCLUDED.parent_id,
  updated_at       = now();

-- ─── Upgrade existing legacy rows in place (conservative) ─────────────────
-- Per user direction: preserve existing taxonomy_term IDs and live
-- talent_profile_taxonomy assignments. Only set term_type so the v2 layer
-- can resolve the row. Specific parent_id linkage (e.g. attaching the
-- generic "Model" row to a "general-models" category_group) happens in the
-- next migration after that group exists.
--
-- DO NOT over-classify generic legacy slugs ("model", "hostess", "dancer")
-- into specific subcategories. Live profiles tagged with the generic term
-- mean "this person is a model", not "this person is a Commercial Model".
-- Specific new types (Fashion Model, Runway Model, etc.) will be seeded as
-- net-new rows.

-- Talent type rows: term_type='talent_type' (matches existing kind).
-- Level stays 1 for now; the next migration sets it to 3 once a parent
-- category_group is attached. This avoids inconsistent depth between
-- assigned and unassigned rows.
UPDATE public.taxonomy_terms
   SET term_type = 'talent_type'
 WHERE kind::text = 'talent_type'
   AND term_type IS DISTINCT FROM 'talent_type';

-- Skill rows: term_type='skill'. Generic skill rows ("hosting", "modeling")
-- stay generic — they're attached to a general skill_group in the next
-- migration without renaming.
UPDATE public.taxonomy_terms
   SET term_type = 'skill'
 WHERE kind::text = 'skill'
   AND term_type IS DISTINCT FROM 'skill';

-- event_type and industry rows become contexts. Existing slugs are
-- preserved.
UPDATE public.taxonomy_terms
   SET term_type = 'context'
 WHERE kind::text IN ('event_type','industry')
   AND term_type IS DISTINCT FROM 'context';

-- Legacy location_city / location_country rows are not v2 hierarchy
-- members. They keep term_type='attribute' (set by migration
-- 20260801120000) and stay flat. No-op here.

COMMIT;
