-- 20260615211200_ml_taxonomy_bio_services_i18n folds the per-locale text
-- columns into jsonb `*_i18n` maps. For agency_taxonomy_settings it reads
--     'en', NULLIF(btrim(custom_label), '')
--     'es', NULLIF(btrim(custom_label_es), '')
-- and then, ~900 lines later, DROPs both columns. From scratch it aborts with
--     ERROR:  column "custom_label" does not exist
--     HINT:  Perhaps you meant to reference the column
--            "agency_taxonomy_settings.custom_label_es"
--
-- HOW THE REPLAY GETS A TABLE PRODUCTION NEVER HAD
--   The migration already guards for the table being ABSENT — its own NOTICE
--   says "agency_taxonomy_settings absent — skipping custom_label i18n
--   migration (created by 20260909221926 later in the same replay, already in
--   its post-migration shape)". That guard is right about the mechanism and
--   one case short of the truth. In this replay the table is PRESENT and in a
--   hybrid shape no production database ever held:
--     * 20260909221926_agency_taxonomy_tables_create_if_missing.sql was
--       deferred and applied early, creating the table in its POST-i18n shape
--       (custom_label_i18n, no custom_label).
--     * 20260527063534_tenant_taxonomy_overrides_… was deferred past it and
--       then added custom_label_es back with ADD COLUMN IF NOT EXISTS.
--   Result: custom_label_i18n + custom_label_es, no custom_label. Present, so
--   the guard does not fire; missing the column, so the UPDATE dies.
--
-- WHY THIS ONE STATEMENT IS THE WHOLE FIX
--   Production held `custom_label` when this migration ran — the column is
--   named in 20260527063534's own comment ("Mirrors custom_label (EN)") and
--   this migration DROPs it at the end, which it could not do if it were not
--   there. Restoring the empty column puts the table in the shape production
--   had at this point; the migration then folds it into custom_label_i18n and
--   drops it again, so the END STATE is unchanged either way. The column is
--   created empty: there are no tenant label overrides in a fresh database, so
--   the fold has nothing to lose.
--
-- This unblocks the single largest cascade in the replay: taxonomy_terms
-- gains name_i18n here, and eight later migrations read tt.name_i18n.
DO $$
BEGIN
  IF to_regclass('public.agency_taxonomy_settings') IS NOT NULL THEN
    ALTER TABLE public.agency_taxonomy_settings
      ADD COLUMN IF NOT EXISTS custom_label text;
  END IF;
END $$;
