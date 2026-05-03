-- Taxonomy v2 — seed step 3a: talent_types (level 3) — Models, Hosts & Promo,
-- Performers, Music & DJs.
--
-- Talent Types are the bookable role vocabulary. A client books a person AS
-- one of these. Skills, languages, contexts, and attributes are NOT in this
-- list — they live in their own term_types.
--
-- Slugs are globally unique within term_type='talent_type'. Where a role
-- could appear in two parent groups (e.g. Bartender), we seed ONE canonical
-- term in its primary location. Cross-discoverability is via search_synonyms
-- on related parents, populated in a later migration.
--
-- DOWN: DELETE FROM public.taxonomy_terms WHERE term_type = 'talent_type' AND created_at >= '2026-08-01';

BEGIN;

-- helper (idempotent)
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
  -- ─── MODELS ─────────────────────────────────────────────────────────────
  -- Fashion Models
  (public.taxv1_uuid('talent_type','editorial-model'),         'talent_type','talent_type',3,'editorial-model',         'Editorial Model',          'Modelo Editorial',          10,  TRUE, TRUE, public.taxv1_uuid('category_group','fashion-models')),
  (public.taxv1_uuid('talent_type','runway-model'),            'talent_type','talent_type',3,'runway-model',            'Runway Model',             'Modelo de Pasarela',        20,  TRUE, TRUE, public.taxv1_uuid('category_group','fashion-models')),
  (public.taxv1_uuid('talent_type','high-fashion-model'),      'talent_type','talent_type',3,'high-fashion-model',      'High Fashion Model',       'Modelo de Alta Moda',       30,  TRUE, TRUE, public.taxv1_uuid('category_group','fashion-models')),
  (public.taxv1_uuid('talent_type','commercial-fashion-model'),'talent_type','talent_type',3,'commercial-fashion-model','Commercial Fashion Model', 'Modelo de Moda Comercial',  40,  TRUE, TRUE, public.taxv1_uuid('category_group','fashion-models')),

  -- Commercial Models
  (public.taxv1_uuid('talent_type','lifestyle-model'),         'talent_type','talent_type',3,'lifestyle-model',         'Lifestyle Model',          'Modelo Lifestyle',          10,  TRUE, TRUE, public.taxv1_uuid('category_group','commercial-models')),
  (public.taxv1_uuid('talent_type','product-model'),           'talent_type','talent_type',3,'product-model',           'Product Model',            'Modelo de Producto',        20,  TRUE, TRUE, public.taxv1_uuid('category_group','commercial-models')),
  (public.taxv1_uuid('talent_type','catalog-model'),           'talent_type','talent_type',3,'catalog-model',           'Catalog Model',            'Modelo de Catálogo',        30,  TRUE, TRUE, public.taxv1_uuid('category_group','commercial-models')),
  (public.taxv1_uuid('talent_type','fitness-model'),           'talent_type','talent_type',3,'fitness-model',           'Fitness Model',            'Modelo Fitness',            40,  TRUE, TRUE, public.taxv1_uuid('category_group','commercial-models')),
  (public.taxv1_uuid('talent_type','swimwear-model'),          'talent_type','talent_type',3,'swimwear-model',          'Swimwear Model',           'Modelo de Trajes de Baño',  50,  TRUE, TRUE, public.taxv1_uuid('category_group','commercial-models')),
  (public.taxv1_uuid('talent_type','beauty-model'),            'talent_type','talent_type',3,'beauty-model',            'Beauty Model',             'Modelo de Belleza',         60,  TRUE, TRUE, public.taxv1_uuid('category_group','commercial-models')),
  (public.taxv1_uuid('talent_type','hair-model'),              'talent_type','talent_type',3,'hair-model',              'Hair Model',               'Modelo de Cabello',         70,  TRUE, TRUE, public.taxv1_uuid('category_group','commercial-models')),
  (public.taxv1_uuid('talent_type','hand-model'),              'talent_type','talent_type',3,'hand-model',              'Hand Model',               'Modelo de Manos',           80,  TRUE, TRUE, public.taxv1_uuid('category_group','commercial-models')),
  (public.taxv1_uuid('talent_type','plus-size-model'),         'talent_type','talent_type',3,'plus-size-model',         'Plus Size Model',          'Modelo Plus Size',          90,  TRUE, TRUE, public.taxv1_uuid('category_group','commercial-models')),
  (public.taxv1_uuid('talent_type','mature-model'),            'talent_type','talent_type',3,'mature-model',            'Mature Model',             'Modelo Maduro',             100, TRUE, TRUE, public.taxv1_uuid('category_group','commercial-models')),
  (public.taxv1_uuid('talent_type','petite-model'),            'talent_type','talent_type',3,'petite-model',            'Petite Model',             'Modelo Petite',             110, TRUE, TRUE, public.taxv1_uuid('category_group','commercial-models')),

  -- Promotional Models
  (public.taxv1_uuid('talent_type','event-promo-model'),       'talent_type','talent_type',3,'event-promo-model',       'Event Promo Model',        'Modelo de Promoción',       10,  TRUE, TRUE, public.taxv1_uuid('category_group','promotional-models')),
  (public.taxv1_uuid('talent_type','brand-ambassador-model'),  'talent_type','talent_type',3,'brand-ambassador-model',  'Brand Ambassador Model',   'Modelo Embajador de Marca', 20,  TRUE, TRUE, public.taxv1_uuid('category_group','promotional-models')),
  (public.taxv1_uuid('talent_type','trade-show-model'),        'talent_type','talent_type',3,'trade-show-model',        'Trade Show Model',         'Modelo de Expo',            30,  TRUE, TRUE, public.taxv1_uuid('category_group','promotional-models')),
  (public.taxv1_uuid('talent_type','nightlife-promo-model'),   'talent_type','talent_type',3,'nightlife-promo-model',   'Nightlife Promo Model',    'Modelo de Vida Nocturna',   40,  TRUE, TRUE, public.taxv1_uuid('category_group','promotional-models')),
  (public.taxv1_uuid('talent_type','luxury-promo-model'),      'talent_type','talent_type',3,'luxury-promo-model',      'Luxury Product Promo Model','Modelo Promo de Lujo',     50,  TRUE, TRUE, public.taxv1_uuid('category_group','promotional-models')),
  (public.taxv1_uuid('talent_type','car-show-model'),          'talent_type','talent_type',3,'car-show-model',          'Car Show Model',           'Modelo de Auto Show',       60,  TRUE, TRUE, public.taxv1_uuid('category_group','promotional-models')),
  (public.taxv1_uuid('talent_type','beverage-promo-model'),    'talent_type','talent_type',3,'beverage-promo-model',    'Beverage Promo Model',     'Modelo de Bebidas',         70,  TRUE, TRUE, public.taxv1_uuid('category_group','promotional-models')),

  -- Content Models
  (public.taxv1_uuid('talent_type','social-media-model'),      'talent_type','talent_type',3,'social-media-model',      'Social Media Model',       'Modelo de Redes Sociales',  10,  TRUE, TRUE, public.taxv1_uuid('category_group','content-models')),
  (public.taxv1_uuid('talent_type','ugc-model'),               'talent_type','talent_type',3,'ugc-model',               'UGC Model',                'Modelo UGC',                20,  TRUE, TRUE, public.taxv1_uuid('category_group','content-models')),
  (public.taxv1_uuid('talent_type','lifestyle-content-model'), 'talent_type','talent_type',3,'lifestyle-content-model', 'Lifestyle Content Model',  'Modelo de Contenido Lifestyle',30,TRUE,TRUE, public.taxv1_uuid('category_group','content-models')),
  (public.taxv1_uuid('talent_type','ecommerce-model'),         'talent_type','talent_type',3,'ecommerce-model',         'E-commerce Model',         'Modelo de E-commerce',      40,  TRUE, TRUE, public.taxv1_uuid('category_group','content-models')),
  (public.taxv1_uuid('talent_type','campaign-model'),          'talent_type','talent_type',3,'campaign-model',          'Campaign Model',           'Modelo de Campaña',         50,  TRUE, TRUE, public.taxv1_uuid('category_group','content-models')),
  (public.taxv1_uuid('talent_type','hotel-lifestyle-model'),   'talent_type','talent_type',3,'hotel-lifestyle-model',   'Hotel/Lifestyle Model',    'Modelo Hotel/Lifestyle',    60,  TRUE, TRUE, public.taxv1_uuid('category_group','content-models')),
  (public.taxv1_uuid('talent_type','tourism-model'),           'talent_type','talent_type',3,'tourism-model',           'Tourism Model',            'Modelo de Turismo',         70,  TRUE, TRUE, public.taxv1_uuid('category_group','content-models')),

  -- Specialty Models
  (public.taxv1_uuid('talent_type','bridal-model'),            'talent_type','talent_type',3,'bridal-model',            'Bridal Model',             'Modelo de Novia',           10,  TRUE, TRUE, public.taxv1_uuid('category_group','specialty-models')),
  (public.taxv1_uuid('talent_type','jewelry-model'),           'talent_type','talent_type',3,'jewelry-model',           'Jewelry Model',            'Modelo de Joyería',         20,  TRUE, TRUE, public.taxv1_uuid('category_group','specialty-models')),
  (public.taxv1_uuid('talent_type','tattoo-model'),            'talent_type','talent_type',3,'tattoo-model',            'Tattoo Model',             'Modelo Tatuado',            30,  TRUE, TRUE, public.taxv1_uuid('category_group','specialty-models')),
  (public.taxv1_uuid('talent_type','art-model'),               'talent_type','talent_type',3,'art-model',               'Art Model',                'Modelo de Arte',            40,  TRUE, TRUE, public.taxv1_uuid('category_group','specialty-models')),

  -- ─── HOSTS & PROMO ──────────────────────────────────────────────────────
  -- Event Hosts
  (public.taxv1_uuid('talent_type','private-event-host'),      'talent_type','talent_type',3,'private-event-host',      'Private Event Host',       'Anfitrión de Evento Privado',10, TRUE, TRUE, public.taxv1_uuid('category_group','event-hosts')),
  (public.taxv1_uuid('talent_type','corporate-event-host'),    'talent_type','talent_type',3,'corporate-event-host',    'Corporate Event Host',     'Anfitrión Corporativo',     20,  TRUE, TRUE, public.taxv1_uuid('category_group','event-hosts')),
  (public.taxv1_uuid('talent_type','wedding-host'),            'talent_type','talent_type',3,'wedding-host',            'Wedding Host',             'Anfitrión de Boda',         30,  TRUE, TRUE, public.taxv1_uuid('category_group','event-hosts')),
  (public.taxv1_uuid('talent_type','vip-host'),                'talent_type','talent_type',3,'vip-host',                'VIP Host',                 'Anfitrión VIP',             40,  TRUE, TRUE, public.taxv1_uuid('category_group','event-hosts')),
  (public.taxv1_uuid('talent_type','luxury-brand-host'),       'talent_type','talent_type',3,'luxury-brand-host',       'Luxury Brand Host',        'Anfitrión de Marca de Lujo',50,  TRUE, TRUE, public.taxv1_uuid('category_group','event-hosts')),
  (public.taxv1_uuid('talent_type','red-carpet-host'),         'talent_type','talent_type',3,'red-carpet-host',         'Red Carpet Host',          'Anfitrión de Alfombra Roja',60,  TRUE, TRUE, public.taxv1_uuid('category_group','event-hosts')),

  -- Hostesses
  (public.taxv1_uuid('talent_type','restaurant-hostess'),      'talent_type','talent_type',3,'restaurant-hostess',      'Restaurant Hostess',       'Hostess de Restaurante',    10,  TRUE, TRUE, public.taxv1_uuid('category_group','hostesses')),
  (public.taxv1_uuid('talent_type','nightlife-hostess'),       'talent_type','talent_type',3,'nightlife-hostess',       'Nightlife Hostess',        'Hostess Nocturna',          20,  TRUE, TRUE, public.taxv1_uuid('category_group','hostesses')),
  (public.taxv1_uuid('talent_type','beach-club-hostess'),      'talent_type','talent_type',3,'beach-club-hostess',      'Beach Club Hostess',       'Hostess de Beach Club',     30,  TRUE, TRUE, public.taxv1_uuid('category_group','hostesses')),
  (public.taxv1_uuid('talent_type','hotel-hostess'),           'talent_type','talent_type',3,'hotel-hostess',           'Hotel Hostess',            'Hostess de Hotel',          40,  TRUE, TRUE, public.taxv1_uuid('category_group','hostesses')),
  (public.taxv1_uuid('talent_type','event-hostess'),           'talent_type','talent_type',3,'event-hostess',           'Event Hostess',            'Hostess de Eventos',        50,  TRUE, TRUE, public.taxv1_uuid('category_group','hostesses')),
  (public.taxv1_uuid('talent_type','vip-guest-hostess'),       'talent_type','talent_type',3,'vip-guest-hostess',       'VIP Guest Hostess',        'Hostess de Invitados VIP',  60,  TRUE, TRUE, public.taxv1_uuid('category_group','hostesses')),

  -- MCs & Presenters
  (public.taxv1_uuid('talent_type','master-of-ceremonies'),    'talent_type','talent_type',3,'master-of-ceremonies',    'Master of Ceremonies',     'Maestro de Ceremonias',     10,  TRUE, TRUE, public.taxv1_uuid('category_group','mcs-presenters')),
  (public.taxv1_uuid('talent_type','event-presenter'),         'talent_type','talent_type',3,'event-presenter',         'Event Presenter',          'Presentador de Eventos',    20,  TRUE, TRUE, public.taxv1_uuid('category_group','mcs-presenters')),
  (public.taxv1_uuid('talent_type','product-launch-presenter'),'talent_type','talent_type',3,'product-launch-presenter','Product Launch Presenter', 'Presentador de Lanzamientos',30,  TRUE, TRUE, public.taxv1_uuid('category_group','mcs-presenters')),
  (public.taxv1_uuid('talent_type','bilingual-presenter'),     'talent_type','talent_type',3,'bilingual-presenter',     'Bilingual Presenter',      'Presentador Bilingüe',      40,  TRUE, TRUE, public.taxv1_uuid('category_group','mcs-presenters')),
  (public.taxv1_uuid('talent_type','stage-presenter'),         'talent_type','talent_type',3,'stage-presenter',         'Stage Presenter',          'Presentador de Escenario',  50,  TRUE, TRUE, public.taxv1_uuid('category_group','mcs-presenters')),

  -- Brand Ambassadors
  (public.taxv1_uuid('talent_type','product-ambassador'),      'talent_type','talent_type',3,'product-ambassador',      'Product Ambassador',       'Embajador de Producto',     10,  TRUE, TRUE, public.taxv1_uuid('category_group','brand-ambassadors')),
  (public.taxv1_uuid('talent_type','trade-show-ambassador'),   'talent_type','talent_type',3,'trade-show-ambassador',   'Trade Show Ambassador',    'Embajador de Expo',         20,  TRUE, TRUE, public.taxv1_uuid('category_group','brand-ambassadors')),
  (public.taxv1_uuid('talent_type','promotional-ambassador'),  'talent_type','talent_type',3,'promotional-ambassador',  'Promotional Ambassador',   'Embajador Promocional',     30,  TRUE, TRUE, public.taxv1_uuid('category_group','brand-ambassadors')),
  (public.taxv1_uuid('talent_type','luxury-brand-ambassador'), 'talent_type','talent_type',3,'luxury-brand-ambassador', 'Luxury Brand Ambassador',  'Embajador de Lujo',         40,  TRUE, TRUE, public.taxv1_uuid('category_group','brand-ambassadors')),
  (public.taxv1_uuid('talent_type','sampling-ambassador'),     'talent_type','talent_type',3,'sampling-ambassador',     'Sampling Ambassador',      'Embajador de Muestras',     50,  TRUE, TRUE, public.taxv1_uuid('category_group','brand-ambassadors')),

  -- Guest Experience Hosts
  (public.taxv1_uuid('talent_type','concierge-host'),          'talent_type','talent_type',3,'concierge-host',          'Concierge Host',           'Anfitrión Concierge',       10,  TRUE, TRUE, public.taxv1_uuid('category_group','guest-experience-hosts')),
  (public.taxv1_uuid('talent_type','villa-guest-host'),        'talent_type','talent_type',3,'villa-guest-host',        'Villa Guest Host',         'Anfitrión de Villa',        20,  TRUE, TRUE, public.taxv1_uuid('category_group','guest-experience-hosts')),
  (public.taxv1_uuid('talent_type','yacht-event-host'),        'talent_type','talent_type',3,'yacht-event-host',        'Yacht Event Host',         'Anfitrión de Yate',         30,  TRUE, TRUE, public.taxv1_uuid('category_group','guest-experience-hosts')),
  (public.taxv1_uuid('talent_type','table-host'),              'talent_type','talent_type',3,'table-host',              'Table Host',               'Anfitrión de Mesa',         40,  TRUE, TRUE, public.taxv1_uuid('category_group','guest-experience-hosts')),
  (public.taxv1_uuid('talent_type','nightlife-host'),          'talent_type','talent_type',3,'nightlife-host',          'Nightlife Host',           'Anfitrión Nocturno',        50,  TRUE, TRUE, public.taxv1_uuid('category_group','guest-experience-hosts')),

  -- ─── PERFORMERS ─────────────────────────────────────────────────────────
  -- Dancers (level-3 talent_types; specialties go to a later migration)
  (public.taxv1_uuid('talent_type','latin-dancer'),            'talent_type','talent_type',3,'latin-dancer',            'Latin Dancer',             'Bailarín Latino',           10,  TRUE, TRUE, public.taxv1_uuid('category_group','dancers')),
  (public.taxv1_uuid('talent_type','classical-dancer'),        'talent_type','talent_type',3,'classical-dancer',        'Classical Dancer',         'Bailarín Clásico',          20,  TRUE, TRUE, public.taxv1_uuid('category_group','dancers')),
  (public.taxv1_uuid('talent_type','cultural-dancer'),         'talent_type','talent_type',3,'cultural-dancer',         'Cultural Dancer',          'Bailarín Cultural',         30,  TRUE, TRUE, public.taxv1_uuid('category_group','dancers')),
  (public.taxv1_uuid('talent_type','nightlife-dancer'),        'talent_type','talent_type',3,'nightlife-dancer',        'Nightlife Dancer',         'Bailarín Nocturno',         40,  TRUE, TRUE, public.taxv1_uuid('category_group','dancers')),
  (public.taxv1_uuid('talent_type','specialty-dancer'),        'talent_type','talent_type',3,'specialty-dancer',        'Specialty Dancer',         'Bailarín Especial',         50,  TRUE, TRUE, public.taxv1_uuid('category_group','dancers')),
  (public.taxv1_uuid('talent_type','dance-group'),             'talent_type','talent_type',3,'dance-group',             'Dance Group',              'Grupo de Baile',            60,  TRUE, TRUE, public.taxv1_uuid('category_group','dancers')),

  -- Specialty Performers
  (public.taxv1_uuid('talent_type','fire-performer'),          'talent_type','talent_type',3,'fire-performer',          'Fire Performer',           'Artista de Fuego',          10,  TRUE, TRUE, public.taxv1_uuid('category_group','specialty-performers')),
  (public.taxv1_uuid('talent_type','fire-dancer'),             'talent_type','talent_type',3,'fire-dancer',             'Fire Dancer',              'Bailarín de Fuego',         15,  TRUE, TRUE, public.taxv1_uuid('category_group','specialty-performers')),
  (public.taxv1_uuid('talent_type','led-performer'),           'talent_type','talent_type',3,'led-performer',           'LED Performer',            'Artista LED',               20,  TRUE, TRUE, public.taxv1_uuid('category_group','specialty-performers')),
  (public.taxv1_uuid('talent_type','aerial-performer'),        'talent_type','talent_type',3,'aerial-performer',        'Aerial Performer',         'Artista Aéreo',             30,  TRUE, TRUE, public.taxv1_uuid('category_group','specialty-performers')),
  (public.taxv1_uuid('talent_type','acrobat'),                 'talent_type','talent_type',3,'acrobat',                 'Acrobat',                  'Acróbata',                  40,  TRUE, TRUE, public.taxv1_uuid('category_group','specialty-performers')),
  (public.taxv1_uuid('talent_type','contortionist'),           'talent_type','talent_type',3,'contortionist',           'Contortionist',            'Contorsionista',            50,  TRUE, TRUE, public.taxv1_uuid('category_group','specialty-performers')),
  (public.taxv1_uuid('talent_type','stilt-walker'),            'talent_type','talent_type',3,'stilt-walker',            'Stilt Walker',             'Zanco',                     60,  TRUE, TRUE, public.taxv1_uuid('category_group','specialty-performers')),
  (public.taxv1_uuid('talent_type','magician'),                'talent_type','talent_type',3,'magician',                'Magician',                 'Mago',                      70,  TRUE, TRUE, public.taxv1_uuid('category_group','specialty-performers')),
  (public.taxv1_uuid('talent_type','mentalist'),               'talent_type','talent_type',3,'mentalist',               'Mentalist',                'Mentalista',                80,  TRUE, TRUE, public.taxv1_uuid('category_group','specialty-performers')),
  (public.taxv1_uuid('talent_type','mime'),                    'talent_type','talent_type',3,'mime',                    'Mime',                     'Mimo',                      90,  TRUE, TRUE, public.taxv1_uuid('category_group','specialty-performers')),
  (public.taxv1_uuid('talent_type','living-statue'),           'talent_type','talent_type',3,'living-statue',           'Living Statue',            'Estatua Viviente',          100, TRUE, TRUE, public.taxv1_uuid('category_group','specialty-performers')),
  (public.taxv1_uuid('talent_type','juggler'),                 'talent_type','talent_type',3,'juggler',                 'Juggler',                  'Malabarista',               110, TRUE, TRUE, public.taxv1_uuid('category_group','specialty-performers')),
  (public.taxv1_uuid('talent_type','circus-performer'),        'talent_type','talent_type',3,'circus-performer',        'Circus Performer',         'Artista de Circo',          120, TRUE, TRUE, public.taxv1_uuid('category_group','specialty-performers')),

  -- Stage & Show Acts
  (public.taxv1_uuid('talent_type','cabaret-act'),             'talent_type','talent_type',3,'cabaret-act',             'Cabaret Act',              'Acto de Cabaret',           10,  TRUE, TRUE, public.taxv1_uuid('category_group','stage-show-acts')),
  (public.taxv1_uuid('talent_type','theater-performer'),       'talent_type','talent_type',3,'theater-performer',       'Theater Performer',        'Artista de Teatro',         20,  TRUE, TRUE, public.taxv1_uuid('category_group','stage-show-acts')),
  (public.taxv1_uuid('talent_type','drag-performer'),          'talent_type','talent_type',3,'drag-performer',          'Drag Performer',           'Artista Drag',              30,  TRUE, TRUE, public.taxv1_uuid('category_group','stage-show-acts')),
  (public.taxv1_uuid('talent_type','comedy-act'),              'talent_type','talent_type',3,'comedy-act',              'Comedy Act',               'Acto de Comedia',           40,  TRUE, TRUE, public.taxv1_uuid('category_group','stage-show-acts')),
  (public.taxv1_uuid('talent_type','variety-show-performer'),  'talent_type','talent_type',3,'variety-show-performer',  'Variety Show Performer',   'Artista de Variedades',     50,  TRUE, TRUE, public.taxv1_uuid('category_group','stage-show-acts')),

  -- ─── MUSIC & DJs ────────────────────────────────────────────────────────
  -- DJs
  (public.taxv1_uuid('talent_type','open-format-dj'),          'talent_type','talent_type',3,'open-format-dj',          'Open Format DJ',           'DJ Open Format',            10,  TRUE, TRUE, public.taxv1_uuid('category_group','djs')),
  (public.taxv1_uuid('talent_type','house-dj'),                'talent_type','talent_type',3,'house-dj',                'House DJ',                 'DJ House',                  20,  TRUE, TRUE, public.taxv1_uuid('category_group','djs')),
  (public.taxv1_uuid('talent_type','techno-dj'),               'talent_type','talent_type',3,'techno-dj',               'Techno DJ',                'DJ Techno',                 30,  TRUE, TRUE, public.taxv1_uuid('category_group','djs')),
  (public.taxv1_uuid('talent_type','latin-dj'),                'talent_type','talent_type',3,'latin-dj',                'Latin DJ',                 'DJ Latino',                 40,  TRUE, TRUE, public.taxv1_uuid('category_group','djs')),
  (public.taxv1_uuid('talent_type','reggaeton-dj'),            'talent_type','talent_type',3,'reggaeton-dj',            'Reggaeton DJ',             'DJ Reggaeton',              50,  TRUE, TRUE, public.taxv1_uuid('category_group','djs')),
  (public.taxv1_uuid('talent_type','hip-hop-dj'),              'talent_type','talent_type',3,'hip-hop-dj',              'Hip Hop DJ',               'DJ Hip Hop',                60,  TRUE, TRUE, public.taxv1_uuid('category_group','djs')),
  (public.taxv1_uuid('talent_type','wedding-dj'),              'talent_type','talent_type',3,'wedding-dj',              'Wedding DJ',               'DJ de Bodas',               70,  TRUE, TRUE, public.taxv1_uuid('category_group','djs')),
  (public.taxv1_uuid('talent_type','corporate-dj'),            'talent_type','talent_type',3,'corporate-dj',            'Corporate DJ',             'DJ Corporativo',            80,  TRUE, TRUE, public.taxv1_uuid('category_group','djs')),
  (public.taxv1_uuid('talent_type','beach-club-dj'),           'talent_type','talent_type',3,'beach-club-dj',           'Beach Club DJ',            'DJ de Beach Club',          90,  TRUE, TRUE, public.taxv1_uuid('category_group','djs')),
  (public.taxv1_uuid('talent_type','club-dj'),                 'talent_type','talent_type',3,'club-dj',                 'Club DJ',                  'DJ de Club',                100, TRUE, TRUE, public.taxv1_uuid('category_group','djs')),
  (public.taxv1_uuid('talent_type','lounge-dj'),               'talent_type','talent_type',3,'lounge-dj',               'Lounge DJ',                'DJ Lounge',                 110, TRUE, TRUE, public.taxv1_uuid('category_group','djs')),

  -- Singers
  (public.taxv1_uuid('talent_type','pop-singer'),              'talent_type','talent_type',3,'pop-singer',              'Pop Singer',               'Cantante de Pop',           10,  TRUE, TRUE, public.taxv1_uuid('category_group','singers')),
  (public.taxv1_uuid('talent_type','jazz-singer'),             'talent_type','talent_type',3,'jazz-singer',             'Jazz Singer',              'Cantante de Jazz',          20,  TRUE, TRUE, public.taxv1_uuid('category_group','singers')),
  (public.taxv1_uuid('talent_type','opera-singer'),            'talent_type','talent_type',3,'opera-singer',            'Opera Singer',             'Cantante de Ópera',         30,  TRUE, TRUE, public.taxv1_uuid('category_group','singers')),
  (public.taxv1_uuid('talent_type','latin-singer'),            'talent_type','talent_type',3,'latin-singer',            'Latin Singer',             'Cantante Latino',           40,  TRUE, TRUE, public.taxv1_uuid('category_group','singers')),
  (public.taxv1_uuid('talent_type','mariachi-singer'),         'talent_type','talent_type',3,'mariachi-singer',         'Mariachi Singer',          'Cantante de Mariachi',      50,  TRUE, TRUE, public.taxv1_uuid('category_group','singers')),
  (public.taxv1_uuid('talent_type','rock-singer'),             'talent_type','talent_type',3,'rock-singer',             'Rock Singer',              'Cantante de Rock',          60,  TRUE, TRUE, public.taxv1_uuid('category_group','singers')),
  (public.taxv1_uuid('talent_type','rnb-singer'),              'talent_type','talent_type',3,'rnb-singer',              'R&B Singer',               'Cantante de R&B',           70,  TRUE, TRUE, public.taxv1_uuid('category_group','singers')),
  (public.taxv1_uuid('talent_type','soul-singer'),             'talent_type','talent_type',3,'soul-singer',             'Soul Singer',              'Cantante de Soul',          80,  TRUE, TRUE, public.taxv1_uuid('category_group','singers')),
  (public.taxv1_uuid('talent_type','acoustic-singer'),         'talent_type','talent_type',3,'acoustic-singer',         'Acoustic Singer',          'Cantante Acústico',         90,  TRUE, TRUE, public.taxv1_uuid('category_group','singers')),
  (public.taxv1_uuid('talent_type','wedding-singer'),          'talent_type','talent_type',3,'wedding-singer',          'Wedding Singer',           'Cantante de Bodas',         100, TRUE, TRUE, public.taxv1_uuid('category_group','singers')),

  -- Musicians
  (public.taxv1_uuid('talent_type','guitarist'),               'talent_type','talent_type',3,'guitarist',               'Guitarist',                'Guitarrista',               10,  TRUE, TRUE, public.taxv1_uuid('category_group','musicians')),
  (public.taxv1_uuid('talent_type','violinist'),               'talent_type','talent_type',3,'violinist',               'Violinist',                'Violinista',                20,  TRUE, TRUE, public.taxv1_uuid('category_group','musicians')),
  (public.taxv1_uuid('talent_type','saxophonist'),             'talent_type','talent_type',3,'saxophonist',             'Saxophonist',              'Saxofonista',               30,  TRUE, TRUE, public.taxv1_uuid('category_group','musicians')),
  (public.taxv1_uuid('talent_type','pianist'),                 'talent_type','talent_type',3,'pianist',                 'Pianist',                  'Pianista',                  40,  TRUE, TRUE, public.taxv1_uuid('category_group','musicians')),
  (public.taxv1_uuid('talent_type','drummer'),                 'talent_type','talent_type',3,'drummer',                 'Drummer',                  'Baterista',                 50,  TRUE, TRUE, public.taxv1_uuid('category_group','musicians')),
  (public.taxv1_uuid('talent_type','percussionist'),           'talent_type','talent_type',3,'percussionist',           'Percussionist',            'Percusionista',             60,  TRUE, TRUE, public.taxv1_uuid('category_group','musicians')),
  (public.taxv1_uuid('talent_type','trumpet-player'),          'talent_type','talent_type',3,'trumpet-player',          'Trumpet Player',           'Trompetista',               70,  TRUE, TRUE, public.taxv1_uuid('category_group','musicians')),
  (public.taxv1_uuid('talent_type','harpist'),                 'talent_type','talent_type',3,'harpist',                 'Harpist',                  'Arpista',                   80,  TRUE, TRUE, public.taxv1_uuid('category_group','musicians')),
  (public.taxv1_uuid('talent_type','cellist'),                 'talent_type','talent_type',3,'cellist',                 'Cellist',                  'Violonchelista',            90,  TRUE, TRUE, public.taxv1_uuid('category_group','musicians')),

  -- Bands & Groups
  (public.taxv1_uuid('talent_type','live-band'),               'talent_type','talent_type',3,'live-band',               'Live Band',                'Banda en Vivo',             10,  TRUE, TRUE, public.taxv1_uuid('category_group','bands-groups')),
  (public.taxv1_uuid('talent_type','jazz-band'),               'talent_type','talent_type',3,'jazz-band',               'Jazz Band',                'Banda de Jazz',             20,  TRUE, TRUE, public.taxv1_uuid('category_group','bands-groups')),
  (public.taxv1_uuid('talent_type','cover-band'),              'talent_type','talent_type',3,'cover-band',              'Cover Band',               'Banda de Covers',           30,  TRUE, TRUE, public.taxv1_uuid('category_group','bands-groups')),
  (public.taxv1_uuid('talent_type','wedding-band'),            'talent_type','talent_type',3,'wedding-band',            'Wedding Band',             'Banda de Bodas',            40,  TRUE, TRUE, public.taxv1_uuid('category_group','bands-groups')),
  (public.taxv1_uuid('talent_type','mariachi-band'),           'talent_type','talent_type',3,'mariachi-band',           'Mariachi Band',            'Mariachi',                  50,  TRUE, TRUE, public.taxv1_uuid('category_group','bands-groups')),
  (public.taxv1_uuid('talent_type','latin-band'),              'talent_type','talent_type',3,'latin-band',              'Latin Band',               'Banda Latina',              60,  TRUE, TRUE, public.taxv1_uuid('category_group','bands-groups')),
  (public.taxv1_uuid('talent_type','acoustic-duo'),            'talent_type','talent_type',3,'acoustic-duo',            'Acoustic Duo',             'Dúo Acústico',              70,  TRUE, TRUE, public.taxv1_uuid('category_group','bands-groups')),
  (public.taxv1_uuid('talent_type','string-quartet'),          'talent_type','talent_type',3,'string-quartet',          'String Quartet',           'Cuarteto de Cuerdas',       80,  TRUE, TRUE, public.taxv1_uuid('category_group','bands-groups'))
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
