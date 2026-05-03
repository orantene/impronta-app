-- Taxonomy v2 — seed step 2: category_groups (level 2).
--
-- Each category_group lives under a parent_category. Slugs are globally
-- unique within term_type='category_group'.
--
-- Includes "General X" fallback groups (general-models, general-hostesses,
-- general-dancers) so legacy generic talent_type rows can be reattached
-- without misrepresenting them as a specific subcategory.
--
-- DOWN (manual):
--   DELETE FROM public.taxonomy_terms WHERE term_type = 'category_group';

BEGIN;

-- Helper from prior migration (CREATE OR REPLACE — idempotent).
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

-- ─── category_groups by parent_category ───────────────────────────────────
INSERT INTO public.taxonomy_terms
  (id, kind, term_type, level, slug, name_en, name_es, sort_order, is_active, is_profile_badge, parent_id)
VALUES
  -- Models
  (public.taxv1_uuid('category_group','general-models'),         'tag', 'category_group', 2, 'general-models',         'General Models',          'Modelos en General',         5,   TRUE, TRUE, public.taxv1_uuid('parent_category','models')),
  (public.taxv1_uuid('category_group','fashion-models'),         'tag', 'category_group', 2, 'fashion-models',         'Fashion Models',          'Modelos de Moda',            10,  TRUE, TRUE, public.taxv1_uuid('parent_category','models')),
  (public.taxv1_uuid('category_group','commercial-models'),      'tag', 'category_group', 2, 'commercial-models',      'Commercial Models',       'Modelos Comerciales',        20,  TRUE, TRUE, public.taxv1_uuid('parent_category','models')),
  (public.taxv1_uuid('category_group','promotional-models'),     'tag', 'category_group', 2, 'promotional-models',     'Promotional Models',      'Modelos Promocionales',      30,  TRUE, TRUE, public.taxv1_uuid('parent_category','models')),
  (public.taxv1_uuid('category_group','content-models'),         'tag', 'category_group', 2, 'content-models',         'Content Models',          'Modelos de Contenido',       40,  TRUE, TRUE, public.taxv1_uuid('parent_category','models')),
  (public.taxv1_uuid('category_group','specialty-models'),       'tag', 'category_group', 2, 'specialty-models',       'Specialty Models',        'Modelos Especiales',         50,  TRUE, TRUE, public.taxv1_uuid('parent_category','models')),

  -- Hosts & Promo
  (public.taxv1_uuid('category_group','general-hostesses'),      'tag', 'category_group', 2, 'general-hostesses',      'General Hostesses',       'Anfitrionas en General',     5,   TRUE, TRUE, public.taxv1_uuid('parent_category','hosts-promo')),
  (public.taxv1_uuid('category_group','event-hosts'),            'tag', 'category_group', 2, 'event-hosts',            'Event Hosts',             'Anfitriones de Eventos',     10,  TRUE, TRUE, public.taxv1_uuid('parent_category','hosts-promo')),
  (public.taxv1_uuid('category_group','hostesses'),              'tag', 'category_group', 2, 'hostesses',              'Hostesses',               'Hostesses',                  20,  TRUE, TRUE, public.taxv1_uuid('parent_category','hosts-promo')),
  (public.taxv1_uuid('category_group','mcs-presenters'),         'tag', 'category_group', 2, 'mcs-presenters',         'MCs & Presenters',        'MCs y Presentadores',        30,  TRUE, TRUE, public.taxv1_uuid('parent_category','hosts-promo')),
  (public.taxv1_uuid('category_group','brand-ambassadors'),      'tag', 'category_group', 2, 'brand-ambassadors',      'Brand Ambassadors',       'Embajadores de Marca',       40,  TRUE, TRUE, public.taxv1_uuid('parent_category','hosts-promo')),
  (public.taxv1_uuid('category_group','guest-experience-hosts'), 'tag', 'category_group', 2, 'guest-experience-hosts', 'Guest Experience Hosts',  'Anfitriones de Invitados',   50,  TRUE, TRUE, public.taxv1_uuid('parent_category','hosts-promo')),

  -- Performers
  (public.taxv1_uuid('category_group','general-dancers'),        'tag', 'category_group', 2, 'general-dancers',        'General Dancers',         'Bailarines en General',      5,   TRUE, TRUE, public.taxv1_uuid('parent_category','performers')),
  (public.taxv1_uuid('category_group','dancers'),                'tag', 'category_group', 2, 'dancers',                'Dancers',                 'Bailarines',                 10,  TRUE, TRUE, public.taxv1_uuid('parent_category','performers')),
  (public.taxv1_uuid('category_group','specialty-performers'),   'tag', 'category_group', 2, 'specialty-performers',   'Specialty Performers',    'Artistas Especiales',        20,  TRUE, TRUE, public.taxv1_uuid('parent_category','performers')),
  (public.taxv1_uuid('category_group','stage-show-acts'),        'tag', 'category_group', 2, 'stage-show-acts',        'Stage & Show Acts',       'Actos de Escenario',         30,  TRUE, TRUE, public.taxv1_uuid('parent_category','performers')),

  -- Music & DJs
  (public.taxv1_uuid('category_group','djs'),                    'tag', 'category_group', 2, 'djs',                    'DJs',                     'DJs',                        10,  TRUE, TRUE, public.taxv1_uuid('parent_category','music-djs')),
  (public.taxv1_uuid('category_group','singers'),                'tag', 'category_group', 2, 'singers',                'Singers',                 'Cantantes',                  20,  TRUE, TRUE, public.taxv1_uuid('parent_category','music-djs')),
  (public.taxv1_uuid('category_group','musicians'),              'tag', 'category_group', 2, 'musicians',              'Musicians',               'Músicos',                    30,  TRUE, TRUE, public.taxv1_uuid('parent_category','music-djs')),
  (public.taxv1_uuid('category_group','bands-groups'),           'tag', 'category_group', 2, 'bands-groups',           'Bands & Groups',          'Bandas y Grupos',            40,  TRUE, TRUE, public.taxv1_uuid('parent_category','music-djs')),

  -- Chefs & Culinary
  (public.taxv1_uuid('category_group','private-chefs'),          'tag', 'category_group', 2, 'private-chefs',          'Private Chefs',           'Chefs Privados',             10,  TRUE, TRUE, public.taxv1_uuid('parent_category','chefs-culinary')),
  (public.taxv1_uuid('category_group','cuisine-specialists'),    'tag', 'category_group', 2, 'cuisine-specialists',    'Cuisine Specialists',     'Especialistas en Cocina',    20,  TRUE, TRUE, public.taxv1_uuid('parent_category','chefs-culinary')),
  (public.taxv1_uuid('category_group','pastry-dessert'),         'tag', 'category_group', 2, 'pastry-dessert',         'Pastry & Dessert',        'Pastelería y Postres',       30,  TRUE, TRUE, public.taxv1_uuid('parent_category','chefs-culinary')),
  (public.taxv1_uuid('category_group','beverage-talent'),        'tag', 'category_group', 2, 'beverage-talent',        'Beverage Talent',         'Bebidas',                    40,  TRUE, TRUE, public.taxv1_uuid('parent_category','chefs-culinary')),
  (public.taxv1_uuid('category_group','culinary-experiences'),   'tag', 'category_group', 2, 'culinary-experiences',   'Culinary Experiences',    'Experiencias Culinarias',    50,  TRUE, TRUE, public.taxv1_uuid('parent_category','chefs-culinary')),

  -- Wellness & Beauty
  (public.taxv1_uuid('category_group','massage-spa'),            'tag', 'category_group', 2, 'massage-spa',            'Massage & Spa',           'Masaje y Spa',               10,  TRUE, TRUE, public.taxv1_uuid('parent_category','wellness-beauty')),
  (public.taxv1_uuid('category_group','fitness-movement'),       'tag', 'category_group', 2, 'fitness-movement',       'Fitness & Movement',      'Fitness y Movimiento',       20,  TRUE, TRUE, public.taxv1_uuid('parent_category','wellness-beauty')),
  (public.taxv1_uuid('category_group','beauty-services'),        'tag', 'category_group', 2, 'beauty-services',        'Beauty Services',         'Servicios de Belleza',       30,  TRUE, TRUE, public.taxv1_uuid('parent_category','wellness-beauty')),
  (public.taxv1_uuid('category_group','wellness-experts'),       'tag', 'category_group', 2, 'wellness-experts',       'Wellness Experts',        'Expertos en Bienestar',      40,  TRUE, TRUE, public.taxv1_uuid('parent_category','wellness-beauty')),

  -- Photo, Video & Creative
  (public.taxv1_uuid('category_group','photography'),            'tag', 'category_group', 2, 'photography',            'Photography',             'Fotografía',                 10,  TRUE, TRUE, public.taxv1_uuid('parent_category','photo-video-creative')),
  (public.taxv1_uuid('category_group','video'),                  'tag', 'category_group', 2, 'video',                  'Video',                   'Video',                      20,  TRUE, TRUE, public.taxv1_uuid('parent_category','photo-video-creative')),
  (public.taxv1_uuid('category_group','creative-direction'),     'tag', 'category_group', 2, 'creative-direction',     'Creative Direction',      'Dirección Creativa',         30,  TRUE, TRUE, public.taxv1_uuid('parent_category','photo-video-creative')),
  (public.taxv1_uuid('category_group','content-production'),     'tag', 'category_group', 2, 'content-production',     'Content Production',      'Producción de Contenido',    40,  TRUE, TRUE, public.taxv1_uuid('parent_category','photo-video-creative')),

  -- Influencers & Creators
  (public.taxv1_uuid('category_group','influencers'),            'tag', 'category_group', 2, 'influencers',            'Influencers',             'Influencers',                10,  TRUE, TRUE, public.taxv1_uuid('parent_category','influencers-creators')),
  (public.taxv1_uuid('category_group','content-creators'),       'tag', 'category_group', 2, 'content-creators',       'Content Creators',        'Creadores de Contenido',     20,  TRUE, TRUE, public.taxv1_uuid('parent_category','influencers-creators')),
  (public.taxv1_uuid('category_group','brand-collaborators'),    'tag', 'category_group', 2, 'brand-collaborators',    'Brand Collaborators',     'Colaboradores de Marca',     30,  TRUE, TRUE, public.taxv1_uuid('parent_category','influencers-creators')),

  -- Event Staff
  (public.taxv1_uuid('category_group','service-staff'),          'tag', 'category_group', 2, 'service-staff',          'Service Staff',           'Personal de Servicio',       10,  TRUE, TRUE, public.taxv1_uuid('parent_category','event-staff')),
  (public.taxv1_uuid('category_group','bar-staff'),              'tag', 'category_group', 2, 'bar-staff',              'Bar Staff',               'Personal de Bar',            20,  TRUE, TRUE, public.taxv1_uuid('parent_category','event-staff')),
  (public.taxv1_uuid('category_group','guest-operations'),       'tag', 'category_group', 2, 'guest-operations',       'Guest Operations',        'Operaciones de Invitados',   30,  TRUE, TRUE, public.taxv1_uuid('parent_category','event-staff')),
  (public.taxv1_uuid('category_group','event-operations'),       'tag', 'category_group', 2, 'event-operations',       'Event Operations',        'Operaciones de Eventos',     40,  TRUE, TRUE, public.taxv1_uuid('parent_category','event-staff')),
  (public.taxv1_uuid('category_group','promotional-staff'),      'tag', 'category_group', 2, 'promotional-staff',      'Promotional Staff',       'Personal Promocional',       50,  TRUE, TRUE, public.taxv1_uuid('parent_category','event-staff')),

  -- Hospitality & Property
  (public.taxv1_uuid('category_group','housekeeping'),           'tag', 'category_group', 2, 'housekeeping',           'Housekeeping',            'Limpieza',                   10,  TRUE, TRUE, public.taxv1_uuid('parent_category','hospitality-property')),
  (public.taxv1_uuid('category_group','villa-estate-staff'),     'tag', 'category_group', 2, 'villa-estate-staff',     'Villa & Estate Staff',    'Personal de Villas',         20,  TRUE, TRUE, public.taxv1_uuid('parent_category','hospitality-property')),
  (public.taxv1_uuid('category_group','hotel-guest-services'),   'tag', 'category_group', 2, 'hotel-guest-services',   'Hotel & Guest Services',  'Hoteles y Servicios',        30,  TRUE, TRUE, public.taxv1_uuid('parent_category','hospitality-property')),
  (public.taxv1_uuid('category_group','property-maintenance'),   'tag', 'category_group', 2, 'property-maintenance',   'Property Maintenance',    'Mantenimiento',              40,  TRUE, TRUE, public.taxv1_uuid('parent_category','hospitality-property')),

  -- Travel & Concierge
  (public.taxv1_uuid('category_group','travel-planning'),        'tag', 'category_group', 2, 'travel-planning',        'Travel Planning',         'Planificación de Viajes',    10,  TRUE, TRUE, public.taxv1_uuid('parent_category','travel-concierge')),
  (public.taxv1_uuid('category_group','concierge-services'),     'tag', 'category_group', 2, 'concierge-services',     'Concierge Services',      'Servicios de Concierge',     20,  TRUE, TRUE, public.taxv1_uuid('parent_category','travel-concierge')),
  (public.taxv1_uuid('category_group','tours-experiences'),      'tag', 'category_group', 2, 'tours-experiences',      'Tours & Experiences',     'Tours y Experiencias',       30,  TRUE, TRUE, public.taxv1_uuid('parent_category','travel-concierge')),
  (public.taxv1_uuid('category_group','local-help'),             'tag', 'category_group', 2, 'local-help',             'Local Help',              'Ayuda Local',                40,  TRUE, TRUE, public.taxv1_uuid('parent_category','travel-concierge')),

  -- Transportation
  (public.taxv1_uuid('category_group','drivers'),                'tag', 'category_group', 2, 'drivers',                'Drivers',                 'Choferes',                   10,  TRUE, TRUE, public.taxv1_uuid('parent_category','transportation')),
  (public.taxv1_uuid('category_group','luxury-transport'),       'tag', 'category_group', 2, 'luxury-transport',       'Luxury Transport',        'Transporte de Lujo',         20,  TRUE, TRUE, public.taxv1_uuid('parent_category','transportation')),
  (public.taxv1_uuid('category_group','boats-marine'),           'tag', 'category_group', 2, 'boats-marine',           'Boats & Marine',          'Embarcaciones',              30,  TRUE, TRUE, public.taxv1_uuid('parent_category','transportation')),
  (public.taxv1_uuid('category_group','logistics'),              'tag', 'category_group', 2, 'logistics',              'Logistics',               'Logística',                  40,  TRUE, TRUE, public.taxv1_uuid('parent_category','transportation')),

  -- Home & Technical Services
  (public.taxv1_uuid('category_group','handyman-services'),      'tag', 'category_group', 2, 'handyman-services',      'Handyman Services',       'Reparaciones Generales',     10,  TRUE, TRUE, public.taxv1_uuid('parent_category','home-technical-services')),
  (public.taxv1_uuid('category_group','skilled-trades'),         'tag', 'category_group', 2, 'skilled-trades',         'Skilled Trades',          'Oficios Calificados',        20,  TRUE, TRUE, public.taxv1_uuid('parent_category','home-technical-services')),
  (public.taxv1_uuid('category_group','smart-home-tech'),        'tag', 'category_group', 2, 'smart-home-tech',        'Smart Home & Tech',       'Hogar Inteligente',          30,  TRUE, TRUE, public.taxv1_uuid('parent_category','home-technical-services')),
  (public.taxv1_uuid('category_group','property-improvement'),   'tag', 'category_group', 2, 'property-improvement',   'Property Improvement',    'Mejora del Hogar',           40,  TRUE, TRUE, public.taxv1_uuid('parent_category','home-technical-services')),

  -- Security & Protection
  (public.taxv1_uuid('category_group','event-security'),         'tag', 'category_group', 2, 'event-security',         'Event Security',          'Seguridad de Eventos',       10,  TRUE, TRUE, public.taxv1_uuid('parent_category','security-protection')),
  (public.taxv1_uuid('category_group','personal-protection'),    'tag', 'category_group', 2, 'personal-protection',    'Personal Protection',     'Protección Personal',        20,  TRUE, TRUE, public.taxv1_uuid('parent_category','security-protection')),
  (public.taxv1_uuid('category_group','property-security'),      'tag', 'category_group', 2, 'property-security',      'Property Security',       'Seguridad de Propiedad',     30,  TRUE, TRUE, public.taxv1_uuid('parent_category','security-protection')),

  -- Sports & Fitness
  (public.taxv1_uuid('category_group','fitness-coaches'),        'tag', 'category_group', 2, 'fitness-coaches',        'Fitness Coaches',         'Entrenadores de Fitness',    10,  TRUE, TRUE, public.taxv1_uuid('parent_category','sports-fitness')),
  (public.taxv1_uuid('category_group','sports-instructors'),     'tag', 'category_group', 2, 'sports-instructors',     'Sports Instructors',      'Instructores Deportivos',    20,  TRUE, TRUE, public.taxv1_uuid('parent_category','sports-fitness')),
  (public.taxv1_uuid('category_group','adventure-sports'),       'tag', 'category_group', 2, 'adventure-sports',       'Adventure Sports',        'Deportes de Aventura',       30,  TRUE, TRUE, public.taxv1_uuid('parent_category','sports-fitness')),

  -- Kids & Family Services
  (public.taxv1_uuid('category_group','childcare'),              'tag', 'category_group', 2, 'childcare',              'Childcare',               'Cuidado Infantil',           10,  TRUE, TRUE, public.taxv1_uuid('parent_category','kids-family-services')),
  (public.taxv1_uuid('category_group','kids-entertainment'),     'tag', 'category_group', 2, 'kids-entertainment',     'Kids Entertainment',      'Entretenimiento Infantil',   20,  TRUE, TRUE, public.taxv1_uuid('parent_category','kids-family-services')),
  (public.taxv1_uuid('category_group','family-support'),         'tag', 'category_group', 2, 'family-support',         'Family Support',          'Apoyo Familiar',             30,  TRUE, TRUE, public.taxv1_uuid('parent_category','kids-family-services')),

  -- Speakers, Coaches & Experts
  (public.taxv1_uuid('category_group','speakers'),               'tag', 'category_group', 2, 'speakers',               'Speakers',                'Conferencistas',             10,  TRUE, TRUE, public.taxv1_uuid('parent_category','speakers-coaches-experts')),
  (public.taxv1_uuid('category_group','coaches'),                'tag', 'category_group', 2, 'coaches',                'Coaches',                 'Coaches',                    20,  TRUE, TRUE, public.taxv1_uuid('parent_category','speakers-coaches-experts')),
  (public.taxv1_uuid('category_group','educators-workshop'),     'tag', 'category_group', 2, 'educators-workshop',     'Educators & Workshop Leaders','Educadores y Talleristas',30,  TRUE, TRUE, public.taxv1_uuid('parent_category','speakers-coaches-experts')),

  -- Production & Behind-the-Scenes
  (public.taxv1_uuid('category_group','event-production'),       'tag', 'category_group', 2, 'event-production',       'Event Production',        'Producción de Eventos',      10,  TRUE, TRUE, public.taxv1_uuid('parent_category','production-bts')),
  (public.taxv1_uuid('category_group','technical-crew'),         'tag', 'category_group', 2, 'technical-crew',         'Technical Crew',          'Equipo Técnico',             20,  TRUE, TRUE, public.taxv1_uuid('parent_category','production-bts')),
  (public.taxv1_uuid('category_group','styling-wardrobe'),       'tag', 'category_group', 2, 'styling-wardrobe',       'Styling & Wardrobe',      'Estilismo y Vestuario',      30,  TRUE, TRUE, public.taxv1_uuid('parent_category','production-bts')),
  (public.taxv1_uuid('category_group','set-decor'),              'tag', 'category_group', 2, 'set-decor',              'Set & Decor',             'Escenografía y Decoración',  40,  TRUE, TRUE, public.taxv1_uuid('parent_category','production-bts')),

  -- Animals & Specialty Acts
  (public.taxv1_uuid('category_group','animal-acts'),            'tag', 'category_group', 2, 'animal-acts',            'Animal Acts',             'Actos con Animales',         10,  TRUE, TRUE, public.taxv1_uuid('parent_category','animals-specialty-acts')),
  (public.taxv1_uuid('category_group','event-animals'),          'tag', 'category_group', 2, 'event-animals',          'Event Animals',           'Animales para Eventos',      20,  TRUE, TRUE, public.taxv1_uuid('parent_category','animals-specialty-acts'))
ON CONFLICT (term_type, slug) DO UPDATE SET
  name_en          = EXCLUDED.name_en,
  name_es          = EXCLUDED.name_es,
  level            = EXCLUDED.level,
  sort_order       = EXCLUDED.sort_order,
  is_active        = EXCLUDED.is_active,
  is_profile_badge = EXCLUDED.is_profile_badge,
  parent_id        = EXCLUDED.parent_id,
  updated_at       = now();

-- ─── Reattach legacy generic talent_type rows to "General X" groups ───────
-- Live profiles tagged with the generic "model" / "hostess" / "dancer" rows
-- have their existing assignments preserved. The terms gain hierarchy
-- context without renaming.
UPDATE public.taxonomy_terms SET parent_id = public.taxv1_uuid('category_group','general-models'),    level = 3 WHERE kind::text = 'talent_type' AND slug = 'model';
UPDATE public.taxonomy_terms SET parent_id = public.taxv1_uuid('category_group','general-hostesses'), level = 3 WHERE kind::text = 'talent_type' AND slug = 'hostess';
UPDATE public.taxonomy_terms SET parent_id = public.taxv1_uuid('category_group','general-dancers'),   level = 3 WHERE kind::text = 'talent_type' AND slug = 'dancer';

-- Specific-but-still-broad legacy rows that already imply a placement.
UPDATE public.taxonomy_terms SET parent_id = public.taxv1_uuid('category_group','promotional-models'),level = 3 WHERE kind::text = 'talent_type' AND slug = 'promotional-model';
UPDATE public.taxonomy_terms SET parent_id = public.taxv1_uuid('category_group','fashion-models'),    level = 3 WHERE kind::text = 'talent_type' AND slug = 'fashion-model';
UPDATE public.taxonomy_terms SET parent_id = public.taxv1_uuid('category_group','singers'),           level = 3 WHERE kind::text = 'talent_type' AND slug = 'singer';
UPDATE public.taxonomy_terms SET parent_id = public.taxv1_uuid('category_group','djs'),               level = 3 WHERE kind::text = 'talent_type' AND slug = 'dj';
UPDATE public.taxonomy_terms SET parent_id = public.taxv1_uuid('category_group','brand-ambassadors'), level = 3 WHERE kind::text = 'talent_type' AND slug = 'brand-ambassador';
UPDATE public.taxonomy_terms SET parent_id = public.taxv1_uuid('category_group','content-creators'),  level = 3 WHERE kind::text = 'talent_type' AND slug = 'content-creator';
UPDATE public.taxonomy_terms SET parent_id = public.taxv1_uuid('category_group','influencers'),       level = 3 WHERE kind::text = 'talent_type' AND slug = 'influencer';
UPDATE public.taxonomy_terms SET parent_id = public.taxv1_uuid('category_group','mcs-presenters'),    level = 3 WHERE kind::text = 'talent_type' AND slug IN ('mc','presenter');
UPDATE public.taxonomy_terms SET parent_id = public.taxv1_uuid('category_group','specialty-performers'),level = 3 WHERE kind::text = 'talent_type' AND slug IN ('performer','entertainer');

COMMIT;
