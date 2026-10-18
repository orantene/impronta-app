-- Placeholder, intentionally a no-op (2026-10-18).
-- Version 20261231412000 is already recorded in schema_migrations on production (applied by the DB
-- owner earlier) and on staging fxlank. Dropping the file would make `db push` stop on "remote
-- versions not found locally" (see incident_hand_applied_migration_never_committed).
-- The real SQL is held, separately, for Oran's typed yes, at
-- supabase/migrations/_pending_pm/20261231414000_sec_definer_anon_revoke_no_public_surface.sql
-- (idempotent; re-running it after 412000 changes nothing).
SELECT 1;
