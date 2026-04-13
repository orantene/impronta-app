-- Identity + canonical location belong on talent_profiles only.
-- Remove duplicate field_values and archive conflicting field_definitions.

BEGIN;
DELETE FROM public.field_values fv
USING public.field_definitions fd
WHERE fd.id = fv.field_definition_id
  AND fd.key IN ('display_name', 'short_bio', 'first_name', 'last_name', 'location');
UPDATE public.field_definitions
SET
  active = false,
  archived_at = COALESCE(archived_at, now()),
  updated_at = now()
WHERE key IN ('display_name', 'short_bio', 'first_name', 'last_name', 'location')
  AND archived_at IS NULL;
COMMIT;
