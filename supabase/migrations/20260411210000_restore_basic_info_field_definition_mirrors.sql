-- Admin → Fields lists `field_definitions` with archived_at IS NULL only.
-- 20260409221000 archived canonical mirror rows (to drop duplicate field_values).
-- Re-activate those mirrors under `basic_info` so staff can see toggles/labels;
-- values still live on talent_profiles, not field_values.

BEGIN;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.field_groups WHERE slug = 'basic_info' AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Missing active field_groups row with slug basic_info (apply earlier field catalog migrations first).';
  END IF;
END $$;
WITH bi AS (
  SELECT id FROM public.field_groups WHERE slug = 'basic_info' AND archived_at IS NULL LIMIT 1
)
UPDATE public.field_definitions fd
SET
  field_group_id = (SELECT id FROM bi),
  archived_at = NULL,
  active = TRUE,
  updated_at = now()
WHERE fd.key IN (
  'display_name',
  'first_name',
  'last_name',
  'phone',
  'gender',
  'date_of_birth',
  'residence_country_id',
  'residence_city_id',
  'origin_country_id',
  'origin_city_id',
  'short_bio',
  'location'
);
WITH g AS (
  SELECT id FROM public.field_groups WHERE slug = 'basic_info' AND archived_at IS NULL LIMIT 1
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
  config,
  archived_at
)
SELECT
  g.id,
  v.key,
  v.label_en,
  v.label_es,
  v.help_en,
  v.help_es,
  v.value_type::public.field_value_type,
  v.required_level::public.field_required_level,
  v.public_visible,
  v.internal_only,
  v.card_visible,
  v.profile_visible,
  v.filterable,
  v.searchable,
  v.ai_visible,
  v.editable_by_talent,
  v.editable_by_staff,
  v.editable_by_admin,
  TRUE,
  v.sort_order,
  NULL::public.taxonomy_kind,
  '{}'::jsonb,
  NULL
FROM g
CROSS JOIN (
  VALUES
    (
      'phone',
      'Phone',
      'Teléfono',
      'Contact phone stored on the talent profile.',
      'Teléfono de contacto en el perfil del talento.',
      'text',
      'optional',
      FALSE,
      TRUE,
      FALSE,
      FALSE,
      FALSE,
      FALSE,
      TRUE,
      TRUE,
      TRUE,
      TRUE,
      40
    ),
    (
      'gender',
      'Gender',
      'Género',
      'Stored on the talent profile for internal use.',
      'Guardado en el perfil del talento (uso interno).',
      'text',
      'optional',
      FALSE,
      TRUE,
      FALSE,
      FALSE,
      FALSE,
      FALSE,
      TRUE,
      TRUE,
      TRUE,
      TRUE,
      50
    ),
    (
      'residence_country_id',
      'Residence country',
      'País de residencia',
      'Canonical geography (FK). Edited on the talent profile form, not as field_values.',
      'Geografía canónica (FK). Se edita en el formulario del perfil.',
      'text',
      'optional',
      FALSE,
      TRUE,
      FALSE,
      FALSE,
      FALSE,
      FALSE,
      TRUE,
      TRUE,
      TRUE,
      TRUE,
      70
    ),
    (
      'residence_city_id',
      'Residence city',
      'Ciudad de residencia',
      'Canonical geography (FK). Edited on the talent profile form, not as field_values.',
      'Geografía canónica (FK). Se edita en el formulario del perfil.',
      'text',
      'optional',
      FALSE,
      TRUE,
      FALSE,
      FALSE,
      FALSE,
      FALSE,
      TRUE,
      TRUE,
      TRUE,
      TRUE,
      80
    ),
    (
      'origin_country_id',
      'Origin country',
      'País de origen',
      'Canonical geography (FK). Edited on the talent profile form, not as field_values.',
      'Geografía canónica (FK). Se edita en el formulario del perfil.',
      'text',
      'optional',
      FALSE,
      TRUE,
      FALSE,
      FALSE,
      FALSE,
      FALSE,
      TRUE,
      TRUE,
      TRUE,
      TRUE,
      90
    ),
    (
      'origin_city_id',
      'Origin city',
      'Ciudad de origen',
      'Canonical geography (FK). Edited on the talent profile form, not as field_values.',
      'Geografía canónica (FK). Se edita en el formulario del perfil.',
      'text',
      'optional',
      FALSE,
      TRUE,
      FALSE,
      FALSE,
      FALSE,
      FALSE,
      TRUE,
      TRUE,
      TRUE,
      TRUE,
      100
    )
) AS v(
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
  sort_order
)
WHERE NOT EXISTS (SELECT 1 FROM public.field_definitions d WHERE d.key = v.key);
COMMIT;
