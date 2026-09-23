-- Folds the labels 20260930000000 just wrote back into name_i18n and removes
-- the two columns 20260930000000.pre.sql had to restore. The expression is
-- 20260615211200's own fold for taxonomy_terms. See the .pre.sql header.
DO $$
BEGIN
  IF to_regclass('public.taxonomy_terms') IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='taxonomy_terms'
                    AND column_name='name_i18n') THEN
    RETURN;   -- pre-fold database: the .pre shim did nothing, leave it alone.
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='taxonomy_terms'
                    AND column_name='name_en') THEN
    RETURN;
  END IF;

  UPDATE public.taxonomy_terms
     SET name_i18n = jsonb_strip_nulls(jsonb_build_object('en', name_en, 'es', name_es))
   WHERE name_en IS DISTINCT FROM (name_i18n ->> 'en')
      OR name_es IS DISTINCT FROM (name_i18n ->> 'es');

  ALTER TABLE public.taxonomy_terms
    DROP COLUMN name_en,
    DROP COLUMN name_es;
END $$;
