-- 20260615200005_consolidate_permissive_policies merges overlapping permissive
-- policies into one per (table, command). It uses bare `CREATE POLICY` — there
-- is no IF NOT EXISTS for policies — and from scratch it aborts with
--     ERROR:  policy "inquiry_approvals_merged_select_public" for table
--             "inquiry_approvals" already exists
--
-- WHY IT ONLY BREAKS IN A REPLAY
--   This migration is itself deferred (it needs booking_commission_snapshot,
--   which a later-sorting file creates). By the time the deferral retries it,
--   two files that sort AFTER it have already created five of its policy
--   names:
--     inquiry_approvals_merged_select_public          20261032000000
--     inquiry_offer_line_items_merged_all_public      20261032000000
--     inquiry_offer_line_items_merged_select_public   20261032000000
--     inquiry_offers_merged_select_public             20261032000000
--     inquiry_events_merged_select_public             20261028000000
--   (found by grepping CREATE POLICY for all 57 names this migration creates;
--   those five are the only collisions.) Production applied this file in its
--   own window, before either of those, and they later replaced the policies
--   with their own definitions — so production ends on THEIR versions.
--
-- WHAT THIS PAIR OF SHIMS DOES
--   .pre  records the five policies exactly as they stand — command, roles,
--         permissive flag, USING and WITH CHECK read back from pg_policies —
--         and drops them so the migration's CREATE succeeds.
--   .post recreates them from that record, so the end state is the one
--         production has and not this migration's intermediate version.
--   Nothing is transcribed by hand: whatever 20261028000000 / 20261032000000
--   actually created is what comes back, and if either is edited later this
--   shim follows without being touched. The scratch table lives in its own
--   `ci_shim` schema and the post-shim removes it.
CREATE SCHEMA IF NOT EXISTS ci_shim;
CREATE TABLE IF NOT EXISTS ci_shim.saved_policies (
  shim       text,
  schemaname text,
  tablename  text,
  policyname text,
  permissive text,
  cmd        text,
  roles      text,
  qual       text,
  withcheck  text
);

DELETE FROM ci_shim.saved_policies WHERE shim = '20260615200005';

INSERT INTO ci_shim.saved_policies
SELECT '20260615200005', schemaname, tablename, policyname, permissive, cmd,
       array_to_string(roles, ', '), qual, with_check
  FROM pg_policies
 WHERE schemaname = 'public'
   AND policyname IN (
     'inquiry_approvals_merged_select_public',
     'inquiry_offer_line_items_merged_all_public',
     'inquiry_offer_line_items_merged_select_public',
     'inquiry_offers_merged_select_public',
     'inquiry_events_merged_select_public'
   );

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM ci_shim.saved_policies WHERE shim = '20260615200005' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;
