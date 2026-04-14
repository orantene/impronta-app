-- Align canonical field mirrors with product rules: phone not in AI doc; gender facet options + filters.

BEGIN;

UPDATE public.field_definitions
SET
  ai_visible = false,
  updated_at = now()
WHERE key = 'phone';

UPDATE public.field_definitions
SET
  filterable = true,
  directory_filter_visible = true,
  config = '{"filter_options": ["Female", "Male", "Non-binary", "Other", "Prefer not to say"]}'::jsonb,
  updated_at = now()
WHERE key = 'gender';

COMMIT;
