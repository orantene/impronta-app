-- Mirror height from governed field_values into talent_profiles.height_cm for directory/API.
-- Numeric profile column stays the read path for cards; field_values remain editable source.

BEGIN;
UPDATE public.talent_profiles tp
SET
  height_cm = ROUND(fv.value_number)::integer,
  updated_at = now()
FROM public.field_values fv
JOIN public.field_definitions fd ON fd.id = fv.field_definition_id
WHERE fd.key = 'height_cm'
  AND fd.archived_at IS NULL
  AND fv.talent_profile_id = tp.id
  AND fv.value_number IS NOT NULL
  AND tp.deleted_at IS NULL;
COMMIT;
