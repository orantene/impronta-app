-- Drop orphaned archive tables flagged by the Supabase security advisor.
--
-- Background: These four tables were created as migration-time backups during
-- two schema clean-up operations (field-engine unification 2026-06-11 and
-- talent-profile column collapse 2026-10-23). They were never intended to be
-- permanent, carry no RLS policies, and expose sensitive PII columns
-- (notably `drivers_license` on talent_profiles_dropped_cols_archive_20261023)
-- directly through the PostgREST API. No application code references them;
-- the only remaining references are stale type declarations in the generated
-- database.types.ts file, which will be regenerated after this migration is
-- applied.
--
-- Security: The `sensitive_columns_exposed` ERROR lint from the Supabase
-- advisor is resolved by this drop. All four tables are safe to remove because:
--   1. They contain point-in-time snapshots of data that still exists in the
--      live tables (the data was not deleted, only the backup copy is dropped).
--   2. No query path in the application selects from them.
--   3. They are not referenced by any view, function, trigger, or foreign key.

DROP TABLE IF EXISTS public.field_definitions_archived_20260611 CASCADE;
DROP TABLE IF EXISTS public.field_values_archived_20260611 CASCADE;
DROP TABLE IF EXISTS public.talent_profiles_dropped_cols_archive_20261023 CASCADE;
DROP TABLE IF EXISTS public.agency_talent_roster_dropped_cols_archive_20261023 CASCADE;
