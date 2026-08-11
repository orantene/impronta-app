-- 20261113000000_secure_backfill_is_primary_scratch_table.sql
--
-- public._backfill_is_primary_20260805 is the REVERSAL RECORD for the
-- 2026-08-05 exclusivity backfill (52 rows: roster_id, tenant_id,
-- talent_profile_id, was_is_primary, backfilled_at). It is the only thing that
-- makes that backfill undoable:
--
--   UPDATE agency_talent_roster SET is_primary = false
--    WHERE id IN (SELECT roster_id FROM public._backfill_is_primary_20260805);
--
-- It shipped with RLS DISABLED, no policies, and full SELECT/INSERT/UPDATE/
-- DELETE/TRUNCATE grants to `anon` and `authenticated`. Anyone holding the
-- public anon key could therefore read the tenant↔talent exclusivity mapping,
-- or TRUNCATE the table and destroy the ability to reverse the backfill.
-- Flagged by the Supabase security advisor (rls_disabled, level: critical).
--
-- Fix: RLS on with NO policies + revoke the grants. This is deliberate, not an
-- oversight — an internal audit/reversal artifact should be reachable ONLY by
-- the service role (which bypasses RLS), so the reversal statement above still
-- works from the SQL editor / a service-role client. No application code reads
-- this table (verified: the sole repo reference is the generated
-- database.types.ts entry).
--
-- Belt AND braces on purpose: RLS alone would be sufficient today, but revoking
-- the grants means a future accidentally-permissive policy still cannot expose
-- the rows to anon/authenticated.

alter table public._backfill_is_primary_20260805 enable row level security;

revoke all on public._backfill_is_primary_20260805 from anon;
revoke all on public._backfill_is_primary_20260805 from authenticated;

comment on table public._backfill_is_primary_20260805 is
  'Reversal record for the 2026-08-05 is_primary exclusivity backfill (52 rows). SERVICE-ROLE ONLY: RLS enabled with no policies and no anon/authenticated grants, by design. Do not add policies — nothing in the app should read this. Safe to drop once the backfill is considered permanent.';
