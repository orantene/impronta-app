-- 20261113000000_secure_backfill_is_primary_scratch_table enables RLS on and
-- revokes grants from public._backfill_is_primary_20260805. No migration
-- creates that table: it is the scratch/reversal record written by hand during
-- the 2026-08-05 exclusivity backfill, so from scratch the ALTER TABLE fails
-- with `relation "public._backfill_is_primary_20260805" does not exist`.
--
-- Recreated from two pieces of evidence, both in the repo:
--   * The migration's own header: "REVERSAL RECORD for the 2026-08-05
--     exclusivity backfill (52 rows: roster_id, tenant_id, talent_profile_id,
--     was_is_primary, backfilled_at)", shipped "with RLS DISABLED, no policies,
--     and full SELECT/INSERT/UPDATE/DELETE/TRUNCATE grants to anon and
--     authenticated".
--   * web/src/lib/supabase/database.types.ts (generated FROM production):
--     roster_id string (the only NOT NULL column), tenant_id, talent_profile_id,
--     was_is_primary boolean, backfilled_at — all nullable.
--
-- THE 52 ROWS ARE NOT REPRODUCED. They are production data about production
-- tenants; this shim creates the table EMPTY. 20261113000000 only changes RLS
-- and grants, so it sees the same object either way. Nothing else in the
-- history or in web/src reads the table (the migration verified that).
--
-- The pre-migration privileges are restored explicitly, because the default
-- grants a fresh CREATE TABLE gets depend on ALTER DEFAULT PRIVILEGES; without
-- them the migration's REVOKEs would be no-ops on a table that never had the
-- grants, and CI would not actually exercise the fix.
CREATE TABLE IF NOT EXISTS public._backfill_is_primary_20260805 (
  roster_id         uuid NOT NULL,
  tenant_id         uuid,
  talent_profile_id uuid,
  was_is_primary    boolean,
  backfilled_at     timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public._backfill_is_primary_20260805 TO anon, authenticated;
