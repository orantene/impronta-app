-- Impronta profile editor policy: use Media and Albums, not the Polaroids
-- section. This is a tenant catalog override only; uploaded media and any
-- stored field values are left intact.

BEGIN;

INSERT INTO public.workspace_profile_field_settings (
  tenant_id,
  field_definition_id,
  enabled_override,
  required_override,
  updated_at
)
SELECT
  a.id,
  pfd.id,
  false,
  false,
  now()
FROM public.agencies a
JOIN public.profile_field_definitions pfd
  ON pfd.field_key = 'media.polaroids'
WHERE a.slug = 'impronta'
ON CONFLICT (tenant_id, field_definition_id)
DO UPDATE SET
  enabled_override = false,
  required_override = false,
  updated_at = EXCLUDED.updated_at;

COMMIT;
