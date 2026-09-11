-- Ledger reconciliation (defects-close, 2026-09-11; D-014 / D-103, "the
-- from-zero replay, four historical files").
--
-- Production's `supabase_migrations.schema_migrations` records this version
-- with no file in the tree. Its stored statement was read back (read-only,
-- management API) and diffed against `20260906030257_product_features_localized_labels.sql`:
-- the same body, applied a second time under the stamp of the moment it was
-- pushed by hand. Only the two RAISE EXCEPTION sentences differ in prose.
-- Evidence: docs/plans/program/evidence/defects-close/sql/05-prod-ledger-four-versions.out.json
--
-- This file exists so the ledger and the tree agree. It changes nothing: the
-- effect belongs to 20260906030257, which sorts earlier and is the file that
-- does the work on any database built from the repo. It only asserts that the
-- effect is present, so a replay that somehow lost the sibling fails here
-- with a sentence instead of silently recording a version.
DO $$
BEGIN
  IF to_regclass('public.product_features') IS NULL THEN
    RAISE NOTICE '20260906030451: product_features absent; nothing to assert';
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'product_features'
       AND column_name IN ('label_i18n', 'value_text_i18n')
    GROUP BY table_name HAVING count(*) = 2
  ) THEN
    RAISE EXCEPTION '20260906030451 is a duplicate stamp of 20260906030257, whose columns label_i18n / value_text_i18n are missing';
  END IF;
END $$;
