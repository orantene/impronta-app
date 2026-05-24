-- Mature 2026 profile engine cleanup.
--
-- Soft-only lifecycle changes:
-- - Sensitive/admin-only fields must not carry a public default flag.
-- - Legacy free-text "skills" is replaced by taxonomy skills/services, so
--   archive it for new input while preserving stored values.

BEGIN;

UPDATE public.profile_field_definitions
SET
  show_in_public = false,
  default_visibility = array_remove(default_visibility, 'public'),
  updated_at = now()
WHERE
  show_in_public = true
  AND (is_sensitive = true OR admin_only = true);

UPDATE public.profile_field_definitions
SET
  deprecated_at = COALESCE(deprecated_at, now()),
  show_in_public = false,
  show_in_directory = false,
  show_in_registration = false,
  show_in_edit_drawer = false,
  default_visibility = array_remove(default_visibility, 'public'),
  updated_at = now()
WHERE field_key = 'skills';

COMMIT;
