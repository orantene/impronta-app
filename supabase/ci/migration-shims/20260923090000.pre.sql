-- 20260923090000_field_defs_kids_speaker_tech seeds field definitions with
--     INSERT INTO public.profile_field_definitions
--       (field_key, label, tier, section, kind, options, helper, unit, …)
-- and from scratch it aborts with
--     ERROR:  column "label" of relation "profile_field_definitions" does not exist
--
-- WHY IT ONLY BREAKS IN A REPLAY
--   `label` and `helper` are created by
--   20260901120000_profile_field_definitions.sql and DROPPED by
--   20260615211100_ml_fields_sections_groups_i18n.sql, which folds them into
--   label_i18n / helper_i18n. 20260615211100 sorts FIVE MONTHS EARLIER than
--   this file, so a version-ordered replay folds first and then meets an
--   INSERT written against the pre-fold shape. Production took them the other
--   way round — create, seed, then fold — which is why the same INSERT worked
--   there and why its rows ended up inside label_i18n.
--
-- WHAT THIS PAIR OF SHIMS DOES
--   .pre  puts `label` and `helper` back (nullable, so existing folded rows are
--         untouched — the original `label` was NOT NULL, which cannot be
--         restored on a populated table and is not needed for an INSERT).
--   .post folds the rows this migration just wrote into label_i18n /
--         helper_i18n with 20260615211100's own expressions, then drops both
--         columns again.
--   End state: the new field definitions exist with their labels inside
--   label_i18n, and the table shape is the post-fold shape — exactly what
--   production has.
DO $$
BEGIN
  IF to_regclass('public.profile_field_definitions') IS NOT NULL THEN
    ALTER TABLE public.profile_field_definitions
      ADD COLUMN IF NOT EXISTS label  text,
      ADD COLUMN IF NOT EXISTS helper text;
  END IF;
END $$;
