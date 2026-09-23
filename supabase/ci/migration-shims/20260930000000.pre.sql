-- 20260930000000_taxonomy_group_leaf_label_cleanup relabels category groups
-- with statements like
--     UPDATE public.taxonomy_terms
--        SET name_en = 'Commercial model types',
--            name_es = COALESCE(name_es, 'Tipos de modelo comercial') …
-- and from scratch it aborts with
--     ERROR:  column "name_es" does not exist
--
-- WHY IT ONLY BREAKS IN A REPLAY
--   name_en / name_es are folded into the jsonb `name_i18n` map and dropped by
--   20260615211200_ml_taxonomy_bio_services_i18n, which sorts THREE MONTHS
--   EARLIER than this file. Production took them in the other order — relabel
--   first, fold afterwards — so the same UPDATEs worked there and their text
--   ended up inside name_i18n. In a version-ordered replay the fold has
--   already happened (once 20260615211200's own blocker is shimmed) and this
--   file meets a table it was not written against.
--
-- WHAT THIS PAIR OF SHIMS DOES
--   .pre  puts name_en / name_es back, seeded FROM name_i18n so the
--         COALESCE(name_es, …) and any read of name_en sees the same values
--         the pre-fold table held — not empty columns, which would silently
--         change what the migration decides to overwrite.
--   .post folds them back into name_i18n with 20260615211200's own expression
--         and drops them again.
--   End state: the relabelled names live in name_i18n and the table is in its
--   post-fold shape — exactly what production has.
DO $$
BEGIN
  IF to_regclass('public.taxonomy_terms') IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='taxonomy_terms'
                    AND column_name='name_i18n') THEN
    RETURN;   -- pre-fold database: the real columns are still there.
  END IF;

  ALTER TABLE public.taxonomy_terms
    ADD COLUMN IF NOT EXISTS name_en text,
    ADD COLUMN IF NOT EXISTS name_es text;

  UPDATE public.taxonomy_terms
     SET name_en = COALESCE(name_en, name_i18n ->> 'en'),
         name_es = COALESCE(name_es, name_i18n ->> 'es');
END $$;
