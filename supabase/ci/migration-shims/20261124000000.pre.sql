-- 20261124000000_lock_leftovers_and_revoke_anon_definer_rpcs enables RLS on,
-- revokes grants from and comments public._impronta_pages_backup_20260817, then
-- asserts relrowsecurity and that anon holds neither SELECT nor DELETE. No
-- migration creates that table: the migration's own header calls it "a 52-row
-- CMS page snapshot left behind by a manual backup", so from scratch the first
-- ALTER TABLE fails with `relation "public._impronta_pages_backup_20260817"
-- does not exist`.
--
-- Recreated as what it is: a `CREATE TABLE … AS SELECT * FROM impronta_pages`
-- snapshot. That provenance is visible in
-- web/src/lib/supabase/database.types.ts (generated FROM production), where
-- every one of its 39 columns is nullable and there is no primary key — the
-- signature of a CTAS copy, not of a declared table.
--
-- THE 52 ROWS ARE NOT REPRODUCED: they are production CMS content and the
-- migration only changes RLS, grants and the table comment. The table is
-- created EMPTY.
--
-- Column list comes from impronta_pages itself rather than a hand-written DDL,
-- so the copy keeps the snapshot's real provenance and cannot drift from a
-- transcription mistake. The one divergence, stated: the snapshot was taken on
-- 2026-08-17 and impronta_pages has been altered since, so a column added
-- after that date appears here and did not exist in the production backup.
-- Nothing reads the table (`grep -r _impronta_pages_backup web/src supabase`
-- → only this migration), so no column list is load-bearing; what matters for
-- this migration is that the relation exists with default grants.
DO $$
BEGIN
  IF to_regclass('public._impronta_pages_backup_20260817') IS NOT NULL THEN
    RETURN;
  END IF;
  IF to_regclass('public.impronta_pages') IS NULL THEN
    RAISE EXCEPTION
      'shim 20261124000000: public.impronta_pages is missing, cannot reproduce the 2026-08-17 snapshot';
  END IF;
  CREATE TABLE public._impronta_pages_backup_20260817 AS
    SELECT * FROM public.impronta_pages WHERE false;
END $$;

-- Restore the pre-migration privileges the migration is there to take away:
-- "RLS was never enabled and the default grants were never revoked, so anon
-- could SELECT, UPDATE and DELETE every row. Verified live:
-- has_table_privilege('anon', …, 'DELETE') = true." Without this the REVOKEs
-- would be no-ops and CI would not exercise the fix.
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public._impronta_pages_backup_20260817 TO anon, authenticated;
