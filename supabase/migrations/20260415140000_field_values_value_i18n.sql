-- Translatable custom profile text: JSONB per locale on field_values (Translation Center plan).

BEGIN;

ALTER TABLE public.field_definitions
  ADD COLUMN IF NOT EXISTS translatable BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.field_values
  ADD COLUMN IF NOT EXISTS value_i18n JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.field_definitions.translatable IS 'When true and value_type is text/textarea, value_i18n stores per-locale copy for Translation Center.';
COMMENT ON COLUMN public.field_values.value_i18n IS 'Localized strings, e.g. {"en":"...","es":"..."}; legacy value_text mirrored to en on backfill.';

UPDATE public.field_values fv
SET value_i18n = jsonb_build_object('en', btrim(fv.value_text))
FROM public.field_definitions d
WHERE fv.field_definition_id = d.id
  AND d.value_type IN ('text', 'textarea')
  AND fv.value_text IS NOT NULL
  AND btrim(fv.value_text) <> ''
  AND fv.value_i18n = '{}'::jsonb;

COMMIT;
