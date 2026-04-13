-- Talent profile field structure: groups + scalar field definitions + controlled option sets.
-- Taxonomy fields remain taxonomy-backed; scalar attributes use field_values (typed columns or value_text with options).

BEGIN;
-- Dependency guard: this migration requires the field system core tables.
DO $$
BEGIN
  IF to_regclass('public.field_groups') IS NULL OR to_regclass('public.field_definitions') IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42P01',
      MESSAGE = 'Missing dependency: field system core tables',
      DETAIL = 'This migration requires public.field_groups and public.field_definitions.',
      HINT = 'Apply 20260409094500_field_system_core.sql before 20260409120000_talent_profile_field_structure.sql.';
  END IF;
END
$$;
-- ---------------------------------------------------------------------------
-- Field groups (refine names + ordering; keep slugs stable)
-- ---------------------------------------------------------------------------

UPDATE public.field_groups
SET
  name_en = CASE slug
    WHEN 'classification' THEN 'Talent Classification'
    WHEN 'traits' THEN 'Physical / Visual Details'
    WHEN 'abilities' THEN 'Languages & Skills'
    WHEN 'experience' THEN 'Experience'
    WHEN 'suitability' THEN 'Availability & Mobility'
    WHEN 'languages' THEN 'Languages & Skills'
    WHEN 'location' THEN 'Basic Information'
    ELSE name_en
  END,
  sort_order = CASE slug
    WHEN 'location' THEN 10
    WHEN 'classification' THEN 20
    WHEN 'traits' THEN 30
    WHEN 'abilities' THEN 40
    WHEN 'experience' THEN 50
    WHEN 'suitability' THEN 60
    WHEN 'languages' THEN 70
    ELSE sort_order
  END,
  updated_at = now()
WHERE archived_at IS NULL
  AND slug IN ('location','classification','traits','abilities','experience','suitability','languages');
-- Add additional groups (do not remove existing)
INSERT INTO public.field_groups (slug, name_en, name_es, sort_order)
VALUES
  ('basic_info', 'Basic Information', 'Información básica', 5),
  ('availability_mobility', 'Availability & Mobility', 'Disponibilidad y movilidad', 60),
  ('media', 'Media', 'Medios', 80),
  ('social_external', 'Social & External', 'Social y externo', 90),
  ('internal_admin', 'Internal / Admin', 'Interno / Admin', 100)
ON CONFLICT (slug) DO NOTHING;
-- ---------------------------------------------------------------------------
-- Helpers: option sets encoded into field_definitions.config for select-like fields.
-- Convention:
-- config.input = 'select'
-- config.options = [ { value, label_en, label_es } ... ]
-- ---------------------------------------------------------------------------

WITH g AS (
  SELECT id, slug FROM public.field_groups WHERE archived_at IS NULL
)
INSERT INTO public.field_definitions (
  field_group_id,
  key,
  label_en,
  label_es,
  help_en,
  help_es,
  value_type,
  required_level,
  public_visible,
  internal_only,
  card_visible,
  profile_visible,
  filterable,
  searchable,
  ai_visible,
  editable_by_talent,
  editable_by_staff,
  editable_by_admin,
  active,
  sort_order,
  taxonomy_kind,
  config
) VALUES
  -- Basic Information (scalar/private)
  ((SELECT id FROM g WHERE slug='basic_info'), 'display_name', 'Display name', 'Nombre para mostrar',
    'Shown on your public profile and across the directory.', 'Visible en tu perfil público y el directorio.',
    'text', 'recommended', TRUE, FALSE, FALSE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 10, NULL,
    '{}'::jsonb),

  ((SELECT id FROM g WHERE slug='internal_admin'), 'first_name', 'First name', 'Nombre',
    'Internal only. Used for contracts and administration.', 'Solo interno. Usado para contratos y administración.',
    'text', 'recommended', FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, TRUE, TRUE, 20, NULL,
    '{}'::jsonb),

  ((SELECT id FROM g WHERE slug='internal_admin'), 'last_name', 'Last name', 'Apellido',
    'Internal only. Used for contracts and administration.', 'Solo interno. Usado para contratos y administración.',
    'text', 'recommended', FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, TRUE, TRUE, 30, NULL,
    '{}'::jsonb),

  ((SELECT id FROM g WHERE slug='internal_admin'), 'date_of_birth', 'Date of birth', 'Fecha de nacimiento',
    'Internal only. Do not share publicly unless the agency requests it.', 'Solo interno. No se comparte públicamente.',
    'date', 'optional', FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, TRUE, TRUE, 40, NULL,
    '{}'::jsonb),

  ((SELECT id FROM g WHERE slug='basic_info'), 'short_bio', 'Short bio', 'Bio corta',
    'Concise positioning and experience summary.', 'Resumen conciso de posicionamiento y experiencia.',
    'textarea', 'recommended', TRUE, FALSE, FALSE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 50, NULL,
    '{}'::jsonb),

  -- Physical / Visual Details (scalar)
  ((SELECT id FROM g WHERE slug='traits'), 'height_cm', 'Height (cm)', 'Altura (cm)',
    'Your height in centimeters.', 'Tu altura en centímetros.',
    'number', 'recommended', TRUE, FALSE, FALSE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 10, NULL,
    jsonb_build_object('min', 80, 'max', 230)),

  ((SELECT id FROM g WHERE slug='traits'), 'eye_color', 'Eye color', 'Color de ojos',
    NULL, NULL,
    'text', 'recommended', TRUE, FALSE, FALSE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 20, NULL,
    jsonb_build_object(
      'input','select',
      'options', jsonb_build_array(
        jsonb_build_object('value','brown','label_en','Brown','label_es',NULL),
        jsonb_build_object('value','dark_brown','label_en','Dark Brown','label_es',NULL),
        jsonb_build_object('value','hazel','label_en','Hazel','label_es',NULL),
        jsonb_build_object('value','green','label_en','Green','label_es',NULL),
        jsonb_build_object('value','blue','label_en','Blue','label_es',NULL),
        jsonb_build_object('value','gray','label_en','Gray','label_es',NULL),
        jsonb_build_object('value','black','label_en','Black','label_es',NULL),
        jsonb_build_object('value','other','label_en','Other','label_es',NULL)
      )
    )),

  ((SELECT id FROM g WHERE slug='traits'), 'hair_color', 'Hair color', 'Color de cabello',
    NULL, NULL,
    'text', 'recommended', TRUE, FALSE, FALSE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 30, NULL,
    jsonb_build_object(
      'input','select',
      'options', jsonb_build_array(
        jsonb_build_object('value','black','label_en','Black','label_es',NULL),
        jsonb_build_object('value','dark_brown','label_en','Dark Brown','label_es',NULL),
        jsonb_build_object('value','brown','label_en','Brown','label_es',NULL),
        jsonb_build_object('value','light_brown','label_en','Light Brown','label_es',NULL),
        jsonb_build_object('value','blonde','label_en','Blonde','label_es',NULL),
        jsonb_build_object('value','dark_blonde','label_en','Dark Blonde','label_es',NULL),
        jsonb_build_object('value','red','label_en','Red','label_es',NULL),
        jsonb_build_object('value','auburn','label_en','Auburn','label_es',NULL),
        jsonb_build_object('value','gray','label_en','Gray','label_es',NULL),
        jsonb_build_object('value','other','label_en','Other','label_es',NULL)
      )
    )),

  ((SELECT id FROM g WHERE slug='traits'), 'hair_length', 'Hair length', 'Largo de cabello',
    NULL, NULL,
    'text', 'recommended', TRUE, FALSE, FALSE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 40, NULL,
    jsonb_build_object(
      'input','select',
      'options', jsonb_build_array(
        jsonb_build_object('value','shaved','label_en','Shaved','label_es',NULL),
        jsonb_build_object('value','very_short','label_en','Very Short','label_es',NULL),
        jsonb_build_object('value','short','label_en','Short','label_es',NULL),
        jsonb_build_object('value','medium','label_en','Medium','label_es',NULL),
        jsonb_build_object('value','long','label_en','Long','label_es',NULL),
        jsonb_build_object('value','very_long','label_en','Very Long','label_es',NULL)
      )
    )),

  ((SELECT id FROM g WHERE slug='traits'), 'body_type', 'Body type', 'Tipo de cuerpo',
    NULL, NULL,
    'text', 'optional', TRUE, FALSE, FALSE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 50, NULL,
    jsonb_build_object(
      'input','select',
      'options', jsonb_build_array(
        jsonb_build_object('value','slim','label_en','Slim','label_es',NULL),
        jsonb_build_object('value','athletic','label_en','Athletic','label_es',NULL),
        jsonb_build_object('value','curvy','label_en','Curvy','label_es',NULL),
        jsonb_build_object('value','muscular','label_en','Muscular','label_es',NULL),
        jsonb_build_object('value','average','label_en','Average','label_es',NULL),
        jsonb_build_object('value','other','label_en','Other','label_es',NULL)
      )
    )),

  ((SELECT id FROM g WHERE slug='traits'), 'clothing_size', 'Clothing size', 'Talla de ropa',
    NULL, NULL,
    'text', 'optional', TRUE, FALSE, FALSE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 60, NULL,
    jsonb_build_object(
      'input','select',
      'options', jsonb_build_array(
        jsonb_build_object('value','xs','label_en','XS','label_es',NULL),
        jsonb_build_object('value','s','label_en','S','label_es',NULL),
        jsonb_build_object('value','m','label_en','M','label_es',NULL),
        jsonb_build_object('value','l','label_en','L','label_es',NULL),
        jsonb_build_object('value','xl','label_en','XL','label_es',NULL),
        jsonb_build_object('value','xxl','label_en','XXL','label_es',NULL)
      )
    )),

  ((SELECT id FROM g WHERE slug='traits'), 'shoe_size', 'Shoe size', 'Talla de zapatos',
    NULL, NULL,
    'text', 'optional', TRUE, FALSE, FALSE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 70, NULL,
    '{}'::jsonb),

  -- Experience (scalar)
  ((SELECT id FROM g WHERE slug='experience'), 'experience_level', 'Experience level', 'Nivel de experiencia',
    NULL, NULL,
    'text', 'recommended', TRUE, FALSE, FALSE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 10, NULL,
    jsonb_build_object(
      'input','select',
      'options', jsonb_build_array(
        jsonb_build_object('value','beginner','label_en','Beginner','label_es',NULL),
        jsonb_build_object('value','intermediate','label_en','Intermediate','label_es',NULL),
        jsonb_build_object('value','experienced','label_en','Experienced','label_es',NULL),
        jsonb_build_object('value','professional','label_en','Professional','label_es',NULL),
        jsonb_build_object('value','highly_experienced','label_en','Highly Experienced','label_es',NULL)
      )
    )),

  ((SELECT id FROM g WHERE slug='experience'), 'years_experience', 'Years experience', 'Años de experiencia',
    NULL, NULL,
    'number', 'optional', TRUE, FALSE, FALSE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 20, NULL,
    jsonb_build_object('min',0,'max',60)),

  ((SELECT id FROM g WHERE slug='experience'), 'notable_work', 'Notable work', 'Trabajo destacado',
    NULL, NULL,
    'textarea', 'optional', TRUE, FALSE, FALSE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 30, NULL,
    '{}'::jsonb),

  ((SELECT id FROM g WHERE slug='experience'), 'professional_highlights', 'Professional highlights', 'Logros profesionales',
    NULL, NULL,
    'textarea', 'optional', TRUE, FALSE, FALSE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 40, NULL,
    '{}'::jsonb),

  -- Availability & Mobility (scalar)
  ((SELECT id FROM g WHERE slug='availability_mobility'), 'availability_status', 'Availability status', 'Disponibilidad',
    NULL, NULL,
    'text', 'recommended', TRUE, FALSE, FALSE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 10, NULL,
    jsonb_build_object(
      'input','select',
      'options', jsonb_build_array(
        jsonb_build_object('value','available_now','label_en','Available Now','label_es',NULL),
        jsonb_build_object('value','available_this_week','label_en','Available This Week','label_es',NULL),
        jsonb_build_object('value','available_this_month','label_en','Available This Month','label_es',NULL),
        jsonb_build_object('value','limited','label_en','Limited Availability','label_es',NULL),
        jsonb_build_object('value','by_request','label_en','By Request','label_es',NULL),
        jsonb_build_object('value','unavailable','label_en','Unavailable','label_es',NULL)
      )
    )),

  ((SELECT id FROM g WHERE slug='availability_mobility'), 'willing_to_travel', 'Willing to travel', 'Disponible para viajar',
    NULL, NULL,
    'boolean', 'recommended', TRUE, FALSE, FALSE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 20, NULL,
    '{}'::jsonb),

  ((SELECT id FROM g WHERE slug='availability_mobility'), 'travel_scope', 'Travel scope', 'Alcance de viaje',
    NULL, NULL,
    'text', 'recommended', TRUE, FALSE, FALSE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 30, NULL,
    jsonb_build_object(
      'input','select',
      'options', jsonb_build_array(
        jsonb_build_object('value','local','label_en','Local Only','label_es',NULL),
        jsonb_build_object('value','region','label_en','State / Region','label_es',NULL),
        jsonb_build_object('value','national','label_en','National','label_es',NULL),
        jsonb_build_object('value','international','label_en','International','label_es',NULL)
      )
    )),

  ((SELECT id FROM g WHERE slug='availability_mobility'), 'available_for', 'Available for', 'Disponible para',
    'Optional notes (e.g. brand activations, conventions, corporate events).', NULL,
    'text', 'optional', TRUE, FALSE, FALSE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 40, NULL,
    '{}'::jsonb),

  -- Social & External (scalar)
  ((SELECT id FROM g WHERE slug='social_external'), 'instagram_url', 'Instagram URL', 'URL de Instagram',
    NULL, NULL,
    'text', 'optional', TRUE, FALSE, FALSE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 10, NULL,
    jsonb_build_object('format','url','placeholder','https://instagram.com/yourhandle')),

  ((SELECT id FROM g WHERE slug='social_external'), 'tiktok_url', 'TikTok URL', 'URL de TikTok',
    NULL, NULL,
    'text', 'optional', TRUE, FALSE, FALSE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 20, NULL,
    jsonb_build_object('format','url','placeholder','https://tiktok.com/@yourhandle')),

  ((SELECT id FROM g WHERE slug='social_external'), 'website_url', 'Website URL', 'Sitio web',
    NULL, NULL,
    'text', 'optional', TRUE, FALSE, FALSE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 30, NULL,
    jsonb_build_object('format','url','placeholder','https://your-site.com')),

  ((SELECT id FROM g WHERE slug='social_external'), 'youtube_url', 'YouTube URL', 'URL de YouTube',
    NULL, NULL,
    'text', 'optional', TRUE, FALSE, FALSE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 40, NULL,
    jsonb_build_object('format','url','placeholder','https://youtube.com/...'))

ON CONFLICT (key) DO NOTHING;
COMMIT;
