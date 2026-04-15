-- Four complete Spanish-only talent profiles based in Tulum (MX): two women, two men.
-- Agency-style rows (user_id NULL) until you run `npm run register:tulum-demo-talent` from `web/`.
--
-- Prerequisites:
--   1. Core migrations applied (field_definitions, taxonomy_terms, etc.).
--   2. `supabase/seed_demo_profiles.sql` applied so TAL-91001–TAL-91003 media paths exist
--      (this seed reuses those storage paths for card, banner, and gallery previews).
--
-- Run in SQL editor or psql as a privileged role (non-production recommended).

BEGIN;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.talent_profiles
    WHERE profile_code = 'TAL-91001'
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION
      'Missing demo pack: apply supabase/seed_demo_profiles.sql first (needs TAL-91001 media).';
  END IF;
END
$guard$;

INSERT INTO public.locations (
  country_code,
  city_slug,
  display_name_en,
  display_name_es
)
VALUES
  ('MX', 'tulum', 'Tulum', 'Tulum')
ON CONFLICT (country_code, city_slug) DO UPDATE
SET display_name_en = EXCLUDED.display_name_en,
    display_name_es = EXCLUDED.display_name_es,
    updated_at = now();

WITH seed_talent (
  profile_code,
  user_id,
  public_slug_part,
  display_name,
  first_name,
  last_name,
  short_bio,
  bio_es,
  workflow_status,
  visibility,
  membership_tier,
  membership_status,
  is_featured,
  featured_level,
  featured_position,
  featured_until,
  listing_started_at,
  profile_completeness_score,
  manual_rank_override,
  country_code,
  city_slug,
  height_cm,
  gender
) AS (
VALUES
  (
    'TAL-92001',
    NULL::uuid,
    'sofia-herrera-tulum',
    'Sofía Herrera',
    'Sofía',
    'Herrera',
    'Modelo y anfitriona en Tulum; español nativo. Experiencia en hospitalidad de lujo y activaciones de marca frente al público.',
    'Soy modelo comercial y anfitriona con base en Tulum. Trabajo campañas de resort, activaciones en playa y eventos corporativos bilingües cuando el cliente lo requiere, aunque mi idioma principal es el español. Me gusta el trabajo con ritmo claro, la puntualidad y el trato cercano con invitados.',
    'approved'::public.profile_workflow_status,
    'public'::public.visibility,
    'premium'::public.membership_tier,
    'active'::public.membership_status,
    FALSE,
    0,
    0,
    NULL::timestamptz,
    '2026-04-01T12:00:00Z'::timestamptz,
    99,
    NULL::int,
    'MX',
    'tulum',
    174,
    'female'
  ),
  (
    'TAL-92002',
    NULL::uuid,
    'carmen-diaz-tulum',
    'Carmen Díaz',
    'Carmen',
    'Díaz',
    'Creadora de contenido y promotora en Riviera Maya; perfiles en español para campañas de turismo y lifestyle.',
    'Creo contenido para marcas de turismo y bienestar desde Tulum. Participo en promociones en hotel, shootings lifestyle y piezas para redes sociales. Comunicación siempre en español; cuido la estética natural, la luz cálida y mensajes auténticos para público latinoamericano.',
    'approved'::public.profile_workflow_status,
    'public'::public.visibility,
    'premium'::public.membership_tier,
    'active'::public.membership_status,
    FALSE,
    0,
    0,
    NULL::timestamptz,
    '2026-04-02T12:00:00Z'::timestamptz,
    97,
    NULL::int,
    'MX',
    'tulum',
    168,
    'female'
  ),
  (
    'TAL-92003',
    NULL::uuid,
    'luis-ortega-tulum',
    'Luis Ortega',
    'Luis',
    'Ortega',
    'Modelo fitness y talento para campañas deportivas en Tulum; español nativo y disponibilidad regional.',
    'Modelo fitness con experiencia en campañas de apparel, clubes de playa y marcas de bienestar en Quintana Roo. Hablo solo español en set y con clientes. Aporto energía estable, buena toma de direcciones y presencia atlética sin perder cercanía con el equipo.',
    'approved'::public.profile_workflow_status,
    'public'::public.visibility,
    'premium'::public.membership_tier,
    'active'::public.membership_status,
    FALSE,
    0,
    0,
    NULL::timestamptz,
    '2026-04-03T12:00:00Z'::timestamptz,
    98,
    NULL::int,
    'MX',
    'tulum',
    184,
    'male'
  ),
  (
    'TAL-92004',
    NULL::uuid,
    'marco-sanchez-tulum',
    'Marco Sánchez',
    'Marco',
    'Sánchez',
    'Presentador y actor para eventos en destino; español nativo, voz clara y manejo de público en vivo.',
    'Presentador y actor con base en Tulum para lanzamientos, paneles y experiencias en hotel. Trabajo en español con guion o improvisación medida. Combino calidez caribeña con timing profesional para que el evento avance sin fricciones.',
    'approved'::public.profile_workflow_status,
    'public'::public.visibility,
    'premium'::public.membership_tier,
    'active'::public.membership_status,
    FALSE,
    0,
    0,
    NULL::timestamptz,
    '2026-04-04T12:00:00Z'::timestamptz,
    98,
    NULL::int,
    'MX',
    'tulum',
    181,
    'male'
  )
)
INSERT INTO public.talent_profiles (
  user_id,
  profile_code,
  public_slug_part,
  display_name,
  first_name,
  last_name,
  short_bio,
  bio_en,
  bio_es,
  bio_es_status,
  bio_es_updated_at,
  workflow_status,
  visibility,
  membership_tier,
  membership_status,
  is_featured,
  featured_level,
  featured_position,
  featured_until,
  listing_started_at,
  profile_completeness_score,
  manual_rank_override,
  location_id,
  residence_country_id,
  residence_city_id,
  origin_country_id,
  origin_city_id,
  height_cm,
  gender
)
SELECT
  st.user_id,
  st.profile_code,
  st.public_slug_part,
  st.display_name,
  st.first_name,
  st.last_name,
  st.short_bio,
  NULL::text,
  st.bio_es,
  'approved'::public.bio_es_status,
  now(),
  st.workflow_status,
  st.visibility,
  st.membership_tier,
  st.membership_status,
  st.is_featured,
  st.featured_level,
  st.featured_position,
  st.featured_until,
  st.listing_started_at,
  st.profile_completeness_score,
  st.manual_rank_override,
  l.id,
  COALESCE(l.country_id, c.id),
  l.id,
  NULL::uuid,
  NULL::uuid,
  st.height_cm,
  st.gender
FROM seed_talent st
JOIN public.locations l
  ON l.country_code = st.country_code
 AND l.city_slug = st.city_slug
LEFT JOIN public.countries c
  ON c.iso2 = upper(st.country_code)
 AND c.archived_at IS NULL
ON CONFLICT (profile_code) DO UPDATE
SET user_id = COALESCE(public.talent_profiles.user_id, EXCLUDED.user_id),
    public_slug_part = EXCLUDED.public_slug_part,
    display_name = EXCLUDED.display_name,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    short_bio = EXCLUDED.short_bio,
    bio_en = EXCLUDED.bio_en,
    bio_es = EXCLUDED.bio_es,
    bio_es_status = EXCLUDED.bio_es_status,
    bio_es_updated_at = EXCLUDED.bio_es_updated_at,
    workflow_status = EXCLUDED.workflow_status,
    visibility = EXCLUDED.visibility,
    membership_tier = EXCLUDED.membership_tier,
    membership_status = EXCLUDED.membership_status,
    is_featured = EXCLUDED.is_featured,
    featured_level = EXCLUDED.featured_level,
    featured_position = EXCLUDED.featured_position,
    featured_until = EXCLUDED.featured_until,
    listing_started_at = EXCLUDED.listing_started_at,
    profile_completeness_score = EXCLUDED.profile_completeness_score,
    manual_rank_override = EXCLUDED.manual_rank_override,
    location_id = EXCLUDED.location_id,
    residence_country_id = EXCLUDED.residence_country_id,
    residence_city_id = EXCLUDED.residence_city_id,
    origin_country_id = EXCLUDED.origin_country_id,
    origin_city_id = EXCLUDED.origin_city_id,
    height_cm = EXCLUDED.height_cm,
    gender = EXCLUDED.gender,
    deleted_at = NULL,
    updated_at = now();

WITH seed_field_values (
  profile_code,
  field_key,
  value_text,
  value_number,
  value_boolean,
  value_date
) AS (
VALUES
  ('TAL-92001', 'eye_color', 'brown', NULL, NULL, NULL),
  ('TAL-92001', 'hair_color', 'dark_brown', NULL, NULL, NULL),
  ('TAL-92001', 'hair_length', 'long', NULL, NULL, NULL),
  ('TAL-92001', 'body_type', 'slim', NULL, NULL, NULL),
  ('TAL-92001', 'clothing_size', 's', NULL, NULL, NULL),
  ('TAL-92001', 'shoe_size', '39', NULL, NULL, NULL),
  ('TAL-92001', 'experience_level', 'professional', NULL, NULL, NULL),
  ('TAL-92001', 'years_experience', NULL, 6, NULL, NULL),
  ('TAL-92001', 'notable_work', 'Campañas para hoteles boutique en Tulum, activaciones de belleza frente al mar y recepciones VIP en la Riviera Maya.', NULL, NULL, NULL),
  ('TAL-92001', 'professional_highlights', 'Español nativo; presencia serena frente a cámara y excelente trato con invitados en eventos de alto flujo.', NULL, NULL, NULL),
  ('TAL-92001', 'availability_status', 'available_now', NULL, NULL, NULL),
  ('TAL-92001', 'willing_to_travel', NULL, NULL, TRUE, NULL),
  ('TAL-92001', 'travel_scope', 'national', NULL, NULL, NULL),
  ('TAL-92001', 'available_for', 'Sesiones comerciales, activaciones en hotel, recepciones y contenido lifestyle en español.', NULL, NULL, NULL),
  ('TAL-92001', 'instagram_url', 'https://instagram.com/sofi.herrera.tulum.demo', NULL, NULL, NULL),
  ('TAL-92001', 'website_url', 'https://soherrera-tulum.demo', NULL, NULL, NULL),
  ('TAL-92001', 'height_cm', NULL, 174, NULL, NULL),
  ('TAL-92001', 'date_of_birth', NULL, NULL, NULL, '1998-04-12'::date),
  ('TAL-92002', 'eye_color', 'green', NULL, NULL, NULL),
  ('TAL-92002', 'hair_color', 'brown', NULL, NULL, NULL),
  ('TAL-92002', 'hair_length', 'medium', NULL, NULL, NULL),
  ('TAL-92002', 'body_type', 'average', NULL, NULL, NULL),
  ('TAL-92002', 'clothing_size', 's', NULL, NULL, NULL),
  ('TAL-92002', 'shoe_size', '38', NULL, NULL, NULL),
  ('TAL-92002', 'experience_level', 'experienced', NULL, NULL, NULL),
  ('TAL-92002', 'years_experience', NULL, 4, NULL, NULL),
  ('TAL-92002', 'notable_work', 'Colaboraciones con marcas de turismo, reels en español para hoteles y cobertura de pop-ups de lifestyle.', NULL, NULL, NULL),
  ('TAL-92002', 'professional_highlights', 'Contenido orgánico en español, rapidez en entregas y buen ojo para locaciones naturales.', NULL, NULL, NULL),
  ('TAL-92002', 'availability_status', 'available_this_week', NULL, NULL, NULL),
  ('TAL-92002', 'willing_to_travel', NULL, NULL, TRUE, NULL),
  ('TAL-92002', 'travel_scope', 'region', NULL, NULL, NULL),
  ('TAL-92002', 'available_for', 'Promociones, UGC en español, sesiones lifestyle y apoyo en lanzamientos turísticos.', NULL, NULL, NULL),
  ('TAL-92002', 'instagram_url', 'https://instagram.com/carmen.diaz.tulum.demo', NULL, NULL, NULL),
  ('TAL-92002', 'tiktok_url', 'https://tiktok.com/@carmen.diaz.tulum.demo', NULL, NULL, NULL),
  ('TAL-92002', 'height_cm', NULL, 168, NULL, NULL),
  ('TAL-92002', 'date_of_birth', NULL, NULL, NULL, '1999-08-22'::date),
  ('TAL-92003', 'eye_color', 'dark_brown', NULL, NULL, NULL),
  ('TAL-92003', 'hair_color', 'black', NULL, NULL, NULL),
  ('TAL-92003', 'hair_length', 'short', NULL, NULL, NULL),
  ('TAL-92003', 'body_type', 'athletic', NULL, NULL, NULL),
  ('TAL-92003', 'clothing_size', 'm', NULL, NULL, NULL),
  ('TAL-92003', 'shoe_size', '44', NULL, NULL, NULL),
  ('TAL-92003', 'experience_level', 'professional', NULL, NULL, NULL),
  ('TAL-92003', 'years_experience', NULL, 7, NULL, NULL),
  ('TAL-92003', 'notable_work', 'Campañas deportivas en la costa, lookbooks para marcas mexicanas y activaciones en clubes de playa.', NULL, NULL, NULL),
  ('TAL-92003', 'professional_highlights', 'Disciplina de entrenamiento constante; comunicación clara solo en español con equipo y clientes.', NULL, NULL, NULL),
  ('TAL-92003', 'availability_status', 'available_now', NULL, NULL, NULL),
  ('TAL-92003', 'willing_to_travel', NULL, NULL, TRUE, NULL),
  ('TAL-92003', 'travel_scope', 'national', NULL, NULL, NULL),
  ('TAL-92003', 'available_for', 'Fitness, swimwear, wellness y eventos deportivos en destino.', NULL, NULL, NULL),
  ('TAL-92003', 'instagram_url', 'https://instagram.com/luis.ortega.tulum.demo', NULL, NULL, NULL),
  ('TAL-92003', 'youtube_url', 'https://youtube.com/@luisortegatuml', NULL, NULL, NULL),
  ('TAL-92003', 'height_cm', NULL, 184, NULL, NULL),
  ('TAL-92003', 'date_of_birth', NULL, NULL, NULL, '1995-01-30'::date),
  ('TAL-92004', 'eye_color', 'brown', NULL, NULL, NULL),
  ('TAL-92004', 'hair_color', 'dark_brown', NULL, NULL, NULL),
  ('TAL-92004', 'hair_length', 'short', NULL, NULL, NULL),
  ('TAL-92004', 'body_type', 'athletic', NULL, NULL, NULL),
  ('TAL-92004', 'clothing_size', 'm', NULL, NULL, NULL),
  ('TAL-92004', 'shoe_size', '43', NULL, NULL, NULL),
  ('TAL-92004', 'experience_level', 'highly_experienced', NULL, NULL, NULL),
  ('TAL-92004', 'years_experience', NULL, 9, NULL, NULL),
  ('TAL-92004', 'notable_work', 'Hosting de lanzamientos en hotel, spots para turismo nacional y moderación de paneles en español.', NULL, NULL, NULL),
  ('TAL-92004', 'professional_highlights', 'Voz clara, manejo de guion en español y calma bajo presión en vivo.', NULL, NULL, NULL),
  ('TAL-92004', 'availability_status', 'by_request', NULL, NULL, NULL),
  ('TAL-92004', 'willing_to_travel', NULL, NULL, TRUE, NULL),
  ('TAL-92004', 'travel_scope', 'international', NULL, NULL, NULL),
  ('TAL-92004', 'available_for', 'Presentación de eventos, comerciales, voz en off y apoyo como actor de reparto.', NULL, NULL, NULL),
  ('TAL-92004', 'instagram_url', 'https://instagram.com/marco.sanchez.tulum.demo', NULL, NULL, NULL),
  ('TAL-92004', 'website_url', 'https://marcosanchez-tulum.demo', NULL, NULL, NULL),
  ('TAL-92004', 'height_cm', NULL, 181, NULL, NULL),
  ('TAL-92004', 'date_of_birth', NULL, NULL, NULL, '1997-11-05'::date)
)
INSERT INTO public.field_values (
  talent_profile_id,
  field_definition_id,
  value_text,
  value_number,
  value_boolean,
  value_date
)
SELECT
  tp.id,
  fd.id,
  sfv.value_text,
  sfv.value_number,
  sfv.value_boolean,
  sfv.value_date
FROM seed_field_values sfv
JOIN public.talent_profiles tp
  ON tp.profile_code = sfv.profile_code
JOIN public.field_definitions fd
  ON fd.key = sfv.field_key
 AND fd.active = TRUE
 AND fd.archived_at IS NULL
ON CONFLICT (talent_profile_id, field_definition_id) DO UPDATE
SET value_text = EXCLUDED.value_text,
    value_number = EXCLUDED.value_number,
    value_boolean = EXCLUDED.value_boolean,
    value_date = EXCLUDED.value_date,
    updated_at = now();

WITH seed_taxonomy (
  profile_code,
  taxonomy_kind,
  taxonomy_slug,
  is_primary
) AS (
VALUES
  ('TAL-92001', 'talent_type', 'commercial-model', TRUE),
  ('TAL-92001', 'tag', 'professional', FALSE),
  ('TAL-92001', 'tag', 'camera-ready', FALSE),
  ('TAL-92001', 'skill', 'modeling', FALSE),
  ('TAL-92001', 'skill', 'hosting', FALSE),
  ('TAL-92001', 'skill', 'brand-activation', FALSE),
  ('TAL-92001', 'language', 'es', FALSE),
  ('TAL-92001', 'industry', 'hospitality', FALSE),
  ('TAL-92001', 'industry', 'tourism', FALSE),
  ('TAL-92001', 'industry', 'beauty', FALSE),
  ('TAL-92001', 'event_type', 'brand-activation', FALSE),
  ('TAL-92001', 'event_type', 'photoshoot', FALSE),
  ('TAL-92001', 'event_type', 'corporate-event', FALSE),
  ('TAL-92001', 'fit_label', 'best-for-events', FALSE),
  ('TAL-92001', 'fit_label', 'best-for-luxury', FALSE),
  ('TAL-92002', 'talent_type', 'influencer', TRUE),
  ('TAL-92002', 'tag', 'camera-ready', FALSE),
  ('TAL-92002', 'tag', 'travel-ready', FALSE),
  ('TAL-92002', 'skill', 'social-media', FALSE),
  ('TAL-92002', 'skill', 'brand-activation', FALSE),
  ('TAL-92002', 'language', 'es', FALSE),
  ('TAL-92002', 'industry', 'tourism', FALSE),
  ('TAL-92002', 'industry', 'beauty', FALSE),
  ('TAL-92002', 'event_type', 'promotional-campaign', FALSE),
  ('TAL-92002', 'event_type', 'photoshoot', FALSE),
  ('TAL-92002', 'fit_label', 'best-for-promotions', FALSE),
  ('TAL-92002', 'fit_label', 'best-for-luxury', FALSE),
  ('TAL-92003', 'talent_type', 'fitness-model', TRUE),
  ('TAL-92003', 'tag', 'professional', FALSE),
  ('TAL-92003', 'skill', 'fitness', FALSE),
  ('TAL-92003', 'skill', 'modeling', FALSE),
  ('TAL-92003', 'language', 'es', FALSE),
  ('TAL-92003', 'industry', 'fitness', FALSE),
  ('TAL-92003', 'industry', 'tourism', FALSE),
  ('TAL-92003', 'event_type', 'commercial-shoot', FALSE),
  ('TAL-92003', 'event_type', 'brand-activation', FALSE),
  ('TAL-92003', 'fit_label', 'best-for-events', FALSE),
  ('TAL-92004', 'talent_type', 'actor', TRUE),
  ('TAL-92004', 'tag', 'professional', FALSE),
  ('TAL-92004', 'skill', 'acting', FALSE),
  ('TAL-92004', 'skill', 'hosting', FALSE),
  ('TAL-92004', 'skill', 'public-speaking', FALSE),
  ('TAL-92004', 'language', 'es', FALSE),
  ('TAL-92004', 'industry', 'entertainment', FALSE),
  ('TAL-92004', 'industry', 'hospitality', FALSE),
  ('TAL-92004', 'industry', 'tourism', FALSE),
  ('TAL-92004', 'event_type', 'corporate-event', FALSE),
  ('TAL-92004', 'event_type', 'product-launch', FALSE),
  ('TAL-92004', 'event_type', 'commercial-shoot', FALSE),
  ('TAL-92004', 'fit_label', 'best-for-hosting', FALSE),
  ('TAL-92004', 'fit_label', 'best-for-acting', FALSE)
)
INSERT INTO public.talent_profile_taxonomy (
  talent_profile_id,
  taxonomy_term_id,
  is_primary
)
SELECT
  tp.id,
  tt.id,
  st.is_primary
FROM seed_taxonomy st
JOIN public.talent_profiles tp
  ON tp.profile_code = st.profile_code
JOIN public.taxonomy_terms tt
  ON tt.kind = st.taxonomy_kind::public.taxonomy_kind
 AND tt.slug = st.taxonomy_slug
 AND tt.archived_at IS NULL
ON CONFLICT (talent_profile_id, taxonomy_term_id) DO UPDATE
SET is_primary = EXCLUDED.is_primary;

WITH ref_paths AS (
  SELECT
    (
      SELECT m.storage_path
      FROM public.media_assets m
      JOIN public.talent_profiles t ON t.id = m.owner_talent_profile_id
      WHERE t.profile_code = 'TAL-91001'
        AND m.variant_kind = 'card'
        AND m.deleted_at IS NULL
      ORDER BY m.sort_order
      LIMIT 1
    ) AS card_path,
    (
      SELECT m.storage_path
      FROM public.media_assets m
      JOIN public.talent_profiles t ON t.id = m.owner_talent_profile_id
      WHERE t.profile_code = 'TAL-91001'
        AND m.variant_kind = 'banner'
        AND m.deleted_at IS NULL
      ORDER BY m.sort_order
      LIMIT 1
    ) AS banner_path,
    (
      SELECT m.storage_path
      FROM public.media_assets m
      JOIN public.talent_profiles t ON t.id = m.owner_talent_profile_id
      WHERE t.profile_code = 'TAL-91001'
        AND m.variant_kind = 'gallery'
        AND m.deleted_at IS NULL
      ORDER BY m.sort_order ASC
      LIMIT 1 OFFSET 0
    ) AS gallery_a_path,
    (
      SELECT m.storage_path
      FROM public.media_assets m
      JOIN public.talent_profiles t ON t.id = m.owner_talent_profile_id
      WHERE t.profile_code = 'TAL-91001'
        AND m.variant_kind = 'gallery'
        AND m.deleted_at IS NULL
      ORDER BY m.sort_order ASC
      LIMIT 1 OFFSET 1
    ) AS gallery_b_path,
    (
      SELECT m.storage_path
      FROM public.media_assets m
      JOIN public.talent_profiles t ON t.id = m.owner_talent_profile_id
      WHERE t.profile_code = 'TAL-91003'
        AND m.variant_kind = 'gallery'
        AND m.deleted_at IS NULL
      ORDER BY m.sort_order ASC
      LIMIT 1 OFFSET 0
    ) AS gallery_c_path
),
seed_media (
  id,
  profile_code,
  uploaded_by_user_id,
  bucket_id,
  variant_kind,
  sort_order,
  approval_state,
  width,
  height,
  file_size,
  metadata
) AS (
VALUES
  ('82000000-0000-0000-0000-000000000071'::uuid, 'TAL-92001', NULL::uuid, 'media-public', 'card'::public.media_variant_kind, 0, 'approved'::public.media_approval_state, 1080, 1350, 246000, '{"seed_profile_code":"TAL-92001","role":"primary-card"}'::jsonb),
  ('82000000-0000-0000-0000-000000000072'::uuid, 'TAL-92001', NULL::uuid, 'media-public', 'banner'::public.media_variant_kind, 1, 'approved'::public.media_approval_state, 2400, 1350, 413000, '{"seed_profile_code":"TAL-92001","role":"hero-banner"}'::jsonb),
  ('82000000-0000-0000-0000-000000000073'::uuid, 'TAL-92001', NULL::uuid, 'media-public', 'gallery'::public.media_variant_kind, 2, 'approved'::public.media_approval_state, 1600, 2000, 389000, '{"seed_profile_code":"TAL-92001","role":"portfolio"}'::jsonb),
  ('82000000-0000-0000-0000-000000000074'::uuid, 'TAL-92001', NULL::uuid, 'media-public', 'gallery'::public.media_variant_kind, 3, 'approved'::public.media_approval_state, 1600, 2000, 391000, '{"seed_profile_code":"TAL-92001","role":"portfolio"}'::jsonb),
  ('82000000-0000-0000-0000-000000000075'::uuid, 'TAL-92001', NULL::uuid, 'media-public', 'gallery'::public.media_variant_kind, 4, 'approved'::public.media_approval_state, 1600, 2000, 392000, '{"seed_profile_code":"TAL-92001","role":"portfolio"}'::jsonb),
  ('82000000-0000-0000-0000-000000000076'::uuid, 'TAL-92002', NULL::uuid, 'media-public', 'card'::public.media_variant_kind, 0, 'approved'::public.media_approval_state, 1080, 1350, 247000, '{"seed_profile_code":"TAL-92002"}'::jsonb),
  ('82000000-0000-0000-0000-000000000077'::uuid, 'TAL-92002', NULL::uuid, 'media-public', 'banner'::public.media_variant_kind, 1, 'approved'::public.media_approval_state, 2400, 1350, 414000, '{"seed_profile_code":"TAL-92002"}'::jsonb),
  ('82000000-0000-0000-0000-000000000078'::uuid, 'TAL-92002', NULL::uuid, 'media-public', 'gallery'::public.media_variant_kind, 2, 'approved'::public.media_approval_state, 1600, 2000, 386000, '{"seed_profile_code":"TAL-92002"}'::jsonb),
  ('82000000-0000-0000-0000-000000000079'::uuid, 'TAL-92002', NULL::uuid, 'media-public', 'gallery'::public.media_variant_kind, 3, 'approved'::public.media_approval_state, 1600, 2000, 387000, '{"seed_profile_code":"TAL-92002"}'::jsonb),
  ('82000000-0000-0000-0000-000000000080'::uuid, 'TAL-92002', NULL::uuid, 'media-public', 'gallery'::public.media_variant_kind, 4, 'approved'::public.media_approval_state, 1600, 2000, 388000, '{"seed_profile_code":"TAL-92002"}'::jsonb),
  ('82000000-0000-0000-0000-000000000081'::uuid, 'TAL-92003', NULL::uuid, 'media-public', 'card'::public.media_variant_kind, 0, 'approved'::public.media_approval_state, 1080, 1350, 249000, '{"seed_profile_code":"TAL-92003"}'::jsonb),
  ('82000000-0000-0000-0000-000000000082'::uuid, 'TAL-92003', NULL::uuid, 'media-public', 'banner'::public.media_variant_kind, 1, 'approved'::public.media_approval_state, 2400, 1350, 415000, '{"seed_profile_code":"TAL-92003"}'::jsonb),
  ('82000000-0000-0000-0000-000000000083'::uuid, 'TAL-92003', NULL::uuid, 'media-public', 'gallery'::public.media_variant_kind, 2, 'approved'::public.media_approval_state, 1600, 2000, 383000, '{"seed_profile_code":"TAL-92003"}'::jsonb),
  ('82000000-0000-0000-0000-000000000084'::uuid, 'TAL-92003', NULL::uuid, 'media-public', 'gallery'::public.media_variant_kind, 3, 'approved'::public.media_approval_state, 1600, 2000, 384000, '{"seed_profile_code":"TAL-92003"}'::jsonb),
  ('82000000-0000-0000-0000-000000000085'::uuid, 'TAL-92003', NULL::uuid, 'media-public', 'gallery'::public.media_variant_kind, 4, 'approved'::public.media_approval_state, 1600, 2000, 385000, '{"seed_profile_code":"TAL-92003"}'::jsonb),
  ('82000000-0000-0000-0000-000000000086'::uuid, 'TAL-92004', NULL::uuid, 'media-public', 'card'::public.media_variant_kind, 0, 'approved'::public.media_approval_state, 1080, 1350, 250000, '{"seed_profile_code":"TAL-92004"}'::jsonb),
  ('82000000-0000-0000-0000-000000000087'::uuid, 'TAL-92004', NULL::uuid, 'media-public', 'banner'::public.media_variant_kind, 1, 'approved'::public.media_approval_state, 2400, 1350, 416000, '{"seed_profile_code":"TAL-92004"}'::jsonb),
  ('82000000-0000-0000-0000-000000000088'::uuid, 'TAL-92004', NULL::uuid, 'media-public', 'gallery'::public.media_variant_kind, 2, 'approved'::public.media_approval_state, 1600, 2000, 393000, '{"seed_profile_code":"TAL-92004"}'::jsonb),
  ('82000000-0000-0000-0000-000000000089'::uuid, 'TAL-92004', NULL::uuid, 'media-public', 'gallery'::public.media_variant_kind, 3, 'approved'::public.media_approval_state, 1600, 2000, 394000, '{"seed_profile_code":"TAL-92004"}'::jsonb),
  ('82000000-0000-0000-0000-000000000090'::uuid, 'TAL-92004', NULL::uuid, 'media-public', 'gallery'::public.media_variant_kind, 4, 'approved'::public.media_approval_state, 1600, 2000, 395000, '{"seed_profile_code":"TAL-92004"}'::jsonb)
)
INSERT INTO public.media_assets (
  id,
  owner_talent_profile_id,
  uploaded_by_user_id,
  bucket_id,
  storage_path,
  variant_kind,
  sort_order,
  approval_state,
  width,
  height,
  file_size,
  metadata
)
SELECT
  sm.id,
  tp.id,
  sm.uploaded_by_user_id,
  sm.bucket_id,
  CASE
    WHEN sm.variant_kind = 'card' THEN rp.card_path
    WHEN sm.variant_kind = 'banner' THEN rp.banner_path
    WHEN sm.variant_kind = 'gallery' AND sm.sort_order = 2 THEN rp.gallery_a_path
    WHEN sm.variant_kind = 'gallery' AND sm.sort_order = 3 THEN rp.gallery_b_path
    WHEN sm.variant_kind = 'gallery' AND sm.sort_order = 4 THEN rp.gallery_c_path
  END,
  sm.variant_kind,
  sm.sort_order,
  sm.approval_state,
  sm.width,
  sm.height,
  sm.file_size,
  sm.metadata
FROM seed_media sm
JOIN public.talent_profiles tp
  ON tp.profile_code = sm.profile_code
CROSS JOIN ref_paths rp
ON CONFLICT (id) DO UPDATE
SET owner_talent_profile_id = EXCLUDED.owner_talent_profile_id,
    uploaded_by_user_id = EXCLUDED.uploaded_by_user_id,
    bucket_id = EXCLUDED.bucket_id,
    storage_path = EXCLUDED.storage_path,
    variant_kind = EXCLUDED.variant_kind,
    sort_order = EXCLUDED.sort_order,
    approval_state = EXCLUDED.approval_state,
    width = EXCLUDED.width,
    height = EXCLUDED.height,
    file_size = EXCLUDED.file_size,
    metadata = EXCLUDED.metadata,
    deleted_at = NULL,
    updated_at = now();

COMMIT;
