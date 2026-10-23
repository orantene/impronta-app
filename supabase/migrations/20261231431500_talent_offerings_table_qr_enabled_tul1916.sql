-- 20261231430000_talent_offerings_table_qr_enabled_tul1916.sql
--
-- TUL-1916: a per-item "Table QR" flag, so an owner chooses which items the
-- table-QR guest menu lists (the Catalog editor's Table QR channel row).
--
-- NOT APPLIED ANYWHERE. Apply to staging only on Grok's GO; production only
-- through the migration gate.
--
-- WHAT: one additive column. No data update, no backfill.
--
-- BEHAVIOUR WHEN APPLIED: the default is true, so every existing item stays on
-- the table-QR guest menu exactly as today; owners switch individual items off
-- in the editor. The code treats a missing key as "listed" too, so it works
-- before this applies and after it.
--
-- ORDER: safe to apply before or after the code.
--
-- ROLLBACK:
--   ALTER TABLE public.talent_offerings DROP COLUMN IF EXISTS table_qr_enabled;
--   (Items switched off would be listed on the table-QR guest menu again.)

ALTER TABLE public.talent_offerings
  ADD COLUMN IF NOT EXISTS table_qr_enabled boolean NOT NULL DEFAULT true;
