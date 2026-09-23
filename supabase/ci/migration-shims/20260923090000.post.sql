-- Folds the rows 20260923090000 just inserted into the i18n maps and removes
-- the two columns 20260923090000.pre.sql had to restore, so the table ends in
-- its post-20260615211100 shape. See the .pre.sql header.
--
-- The two UPDATEs are 20260615211100's own expressions, narrowed to the rows
-- that still carry a plain `label` / `helper` (i.e. the ones this migration
-- wrote); rows folded earlier already have their maps and are left alone.
DO $$
BEGIN
  IF to_regclass('public.profile_field_definitions') IS NULL THEN RETURN; END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='profile_field_definitions'
                AND column_name='label') THEN
    UPDATE public.profile_field_definitions
       SET label_i18n = jsonb_strip_nulls(jsonb_build_object('en', label))
     WHERE label IS NOT NULL
       AND (label_i18n IS NULL OR label_i18n = '{}'::jsonb);
    ALTER TABLE public.profile_field_definitions DROP COLUMN label;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='profile_field_definitions'
                AND column_name='helper') THEN
    UPDATE public.profile_field_definitions
       SET helper_i18n = jsonb_strip_nulls(jsonb_build_object('en', helper))
     WHERE helper IS NOT NULL
       AND (helper_i18n IS NULL OR helper_i18n = '{}'::jsonb);
    ALTER TABLE public.profile_field_definitions DROP COLUMN helper;
  END IF;
END $$;
