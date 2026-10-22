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
-- BEHAVIOUR WHEN APPLIED: the default is false, so every existing item leaves
-- the table-QR guest menu until its owner switches Table QR on in the editor.
-- The code reads the key when present and treats a missing key as "listed", so
-- it works before this applies (nothing changes) and after it (opt-in).
--
-- ORDER: safe to apply before or after the code.
--
-- ROLLBACK:
--   ALTER TABLE public.talent_offerings DROP COLUMN IF EXISTS table_qr_enabled;
--   (Every item would again be listed on the table-QR guest menu.)

ALTER TABLE public.talent_offerings
  ADD COLUMN IF NOT EXISTS table_qr_enabled boolean NOT NULL DEFAULT false;
