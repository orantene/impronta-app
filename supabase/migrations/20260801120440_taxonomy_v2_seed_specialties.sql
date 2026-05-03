-- Taxonomy v2 — seed step 4: specialties (level 4).
--
-- Specialties refine a single talent_type. They are the leaves of the Talent
-- Type tree. We seed only the high-traffic specialties named in the spec —
-- not an exhaustive list. More can be added incrementally.
--
-- Examples seeded:
--   Latin Dancer        -> Salsa, Bachata, Merengue, Reggaeton
--   Classical Dancer    -> Ballet, Contemporary, Modern
--   Cultural Dancer     -> Belly Dancer, Flamenco, Folkloric, Samba, Polynesian
--   Nightlife Dancer    -> Go-Go Dancer, Club Dancer, Showgirl, Cabaret Dancer
--   Specialty Dancer    -> LED Dancer, Aerial Dancer, Pole Performer, Stilt Dancer
--                         (Fire Dancer is its own talent_type — not duplicated here)
--   Dance Group         -> Dance Crew, Wedding Dance Team, Corporate Show Team

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

INSERT INTO public.taxonomy_terms
  (id, kind, term_type, level, slug, name_en, name_es, sort_order, is_active, is_profile_badge, parent_id)
VALUES
  -- Latin Dancer specialties
  (public.taxv1_uuid('specialty','salsa'),                'tag', 'specialty', 4, 'salsa',                'Salsa',                  'Salsa',                  10, TRUE, TRUE, public.taxv1_uuid('talent_type','latin-dancer')),
  (public.taxv1_uuid('specialty','bachata'),              'tag', 'specialty', 4, 'bachata',              'Bachata',                'Bachata',                20, TRUE, TRUE, public.taxv1_uuid('talent_type','latin-dancer')),
  (public.taxv1_uuid('specialty','merengue'),             'tag', 'specialty', 4, 'merengue',             'Merengue',               'Merengue',               30, TRUE, TRUE, public.taxv1_uuid('talent_type','latin-dancer')),
  (public.taxv1_uuid('specialty','reggaeton'),            'tag', 'specialty', 4, 'reggaeton',            'Reggaeton',              'Reggaeton',              40, TRUE, TRUE, public.taxv1_uuid('talent_type','latin-dancer')),

  -- Classical Dancer specialties
  (public.taxv1_uuid('specialty','ballet'),               'tag', 'specialty', 4, 'ballet',               'Ballet',                 'Ballet',                 10, TRUE, TRUE, public.taxv1_uuid('talent_type','classical-dancer')),
  (public.taxv1_uuid('specialty','contemporary'),         'tag', 'specialty', 4, 'contemporary',         'Contemporary',           'Contemporáneo',          20, TRUE, TRUE, public.taxv1_uuid('talent_type','classical-dancer')),
  (public.taxv1_uuid('specialty','modern-dance'),         'tag', 'specialty', 4, 'modern-dance',         'Modern',                 'Moderno',                30, TRUE, TRUE, public.taxv1_uuid('talent_type','classical-dancer')),

  -- Cultural Dancer specialties
  (public.taxv1_uuid('specialty','belly-dancer'),         'tag', 'specialty', 4, 'belly-dancer',         'Belly Dancer',           'Bailarín del Vientre',   10, TRUE, TRUE, public.taxv1_uuid('talent_type','cultural-dancer')),
  (public.taxv1_uuid('specialty','flamenco'),             'tag', 'specialty', 4, 'flamenco',             'Flamenco',               'Flamenco',               20, TRUE, TRUE, public.taxv1_uuid('talent_type','cultural-dancer')),
  (public.taxv1_uuid('specialty','folkloric'),            'tag', 'specialty', 4, 'folkloric',            'Folkloric',              'Folclórico',             30, TRUE, TRUE, public.taxv1_uuid('talent_type','cultural-dancer')),
  (public.taxv1_uuid('specialty','samba'),                'tag', 'specialty', 4, 'samba',                'Samba',                  'Samba',                  40, TRUE, TRUE, public.taxv1_uuid('talent_type','cultural-dancer')),
  (public.taxv1_uuid('specialty','polynesian'),           'tag', 'specialty', 4, 'polynesian',           'Polynesian',             'Polinesio',              50, TRUE, TRUE, public.taxv1_uuid('talent_type','cultural-dancer')),

  -- Nightlife Dancer specialties
  (public.taxv1_uuid('specialty','go-go-dancer'),         'tag', 'specialty', 4, 'go-go-dancer',         'Go-Go Dancer',           'Bailarín Go-Go',         10, TRUE, TRUE, public.taxv1_uuid('talent_type','nightlife-dancer')),
  (public.taxv1_uuid('specialty','club-dancer'),          'tag', 'specialty', 4, 'club-dancer',          'Club Dancer',            'Bailarín de Club',       20, TRUE, TRUE, public.taxv1_uuid('talent_type','nightlife-dancer')),
  (public.taxv1_uuid('specialty','showgirl'),             'tag', 'specialty', 4, 'showgirl',             'Showgirl',               'Showgirl',               30, TRUE, TRUE, public.taxv1_uuid('talent_type','nightlife-dancer')),
  (public.taxv1_uuid('specialty','cabaret-dancer'),       'tag', 'specialty', 4, 'cabaret-dancer',       'Cabaret Dancer',         'Bailarín de Cabaret',    40, TRUE, TRUE, public.taxv1_uuid('talent_type','nightlife-dancer')),

  -- Specialty Dancer subtypes (Fire Dancer is its own talent_type — not duplicated here)
  (public.taxv1_uuid('specialty','led-dancer'),           'tag', 'specialty', 4, 'led-dancer',           'LED Dancer',             'Bailarín LED',           10, TRUE, TRUE, public.taxv1_uuid('talent_type','specialty-dancer')),
  (public.taxv1_uuid('specialty','aerial-dancer'),        'tag', 'specialty', 4, 'aerial-dancer',        'Aerial Dancer',          'Bailarín Aéreo',         20, TRUE, TRUE, public.taxv1_uuid('talent_type','specialty-dancer')),
  (public.taxv1_uuid('specialty','pole-performer'),       'tag', 'specialty', 4, 'pole-performer',       'Pole Performer',         'Bailarín de Tubo',       30, TRUE, TRUE, public.taxv1_uuid('talent_type','specialty-dancer')),
  (public.taxv1_uuid('specialty','stilt-dancer'),         'tag', 'specialty', 4, 'stilt-dancer',         'Stilt Dancer',           'Bailarín en Zancos',     40, TRUE, TRUE, public.taxv1_uuid('talent_type','specialty-dancer')),

  -- Dance Group specialties
  (public.taxv1_uuid('specialty','dance-crew'),           'tag', 'specialty', 4, 'dance-crew',           'Dance Crew',             'Crew de Baile',          10, TRUE, TRUE, public.taxv1_uuid('talent_type','dance-group')),
  (public.taxv1_uuid('specialty','wedding-dance-team'),   'tag', 'specialty', 4, 'wedding-dance-team',   'Wedding Dance Team',     'Equipo de Baile de Bodas',20, TRUE, TRUE, public.taxv1_uuid('talent_type','dance-group')),
  (public.taxv1_uuid('specialty','corporate-show-team'),  'tag', 'specialty', 4, 'corporate-show-team',  'Corporate Show Team',    'Equipo Corporativo',     30, TRUE, TRUE, public.taxv1_uuid('talent_type','dance-group'))
ON CONFLICT (term_type, slug) DO UPDATE SET
  name_en = EXCLUDED.name_en,
  name_es = EXCLUDED.name_es,
  level = EXCLUDED.level,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active,
  is_profile_badge = EXCLUDED.is_profile_badge,
  parent_id = EXCLUDED.parent_id,
  updated_at = now();

COMMIT;
