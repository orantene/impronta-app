-- ============================================================================
-- T4 — Collapse dedicated columns (field-engine unification, Phase 4).
--
-- The P3 work migrated 4 families of profile fields OFF dedicated columns
-- (on talent_profiles + agency_talent_roster) and INTO System-B value rows
-- (public.talent_profile_field_values), keeping the columns dual-written +
-- read-fallback (reversible). System A is now fully retired and B is the sole
-- store. This migration COLLAPSES the migrated columns: it stops being read /
-- written from code (done in the same PR) and DROPS the now-redundant columns.
--
-- SAFETY — verified read-only against prod BEFORE writing this migration:
--   For every dropped column, every talent carrying a non-null/meaningful
--   column value ALSO has a matching System-B value row with the same value.
--   column-only count = 0 and value-mismatch count = 0 for ALL 27 columns
--   (per-family parity tables in the PR description). Nothing is lost on drop.
--
-- ARCHIVE-FIRST recovery net: before dropping, the full column contents are
-- snapshotted into two archive tables (keyed by row id). If a drop ever needs
-- to be undone, the data is recoverable from these tables + the matching
-- System-B value rows.
--
-- DDL impact scan (verified): no public function, view, materialized view,
-- index, or generated column references any dropped column. Single-column
-- CHECK constraints on dropped columns (age_display_chk, drivers_license_chk,
-- passport_status_chk, pronouns_chk, rate_card_visibility_chk,
-- response_time_chk) are auto-dropped with their column (no CASCADE needed).
-- The trg_sync_gender_presenting_label trigger fires OF gender, which is KEPT.
--
-- CARVE-OUTS (NOT dropped — intentional dedicated stores; see T4.0 below):
--   talent_profiles: date_of_birth, gender, display_name/first_name/last_name/
--     legal_name, languages (via talent_languages), nationality,
--     home_country_text, service areas, availability_data, feature_in_directory,
--     media (media_assets), contact (invitation_email/phone).
-- ============================================================================

BEGIN;

-- ─── T4.0 — Document the carve-outs in the registry ─────────────────────────
-- `profile_field_definitions.storage_mode` already discriminates 'dedicated'
-- (kept on a column) vs 'field_values' (System B). Annotate the carve-out
-- fields whose columns are KEPT BY DESIGN (query-critical, vocab-critical, or a
-- legacy-mirror collision) so the registry records intent, not just mechanism.

-- gender is a special case: its value is mirrored to System B (storage_mode was
-- flipped to 'field_values' in the Tier-C tail) BUT the talent_profiles.gender
-- column is KEPT — the directory gender facet filters the column directly via
-- `.in("gender", values)`, and trg_sync_gender_presenting_label depends on it.
-- It is therefore a DUAL carve-out: System B is the editor source, the column
-- stays for the directory query. Record that explicitly.
UPDATE public.profile_field_definitions
SET note = 'CARVE-OUT (T4): talent_profiles.gender column is KEPT BY DESIGN even though '
           || 'the value is also mirrored to System B. The directory gender facet filters '
           || 'the column directly (apply-directory-field-facet-filters) and '
           || 'trg_sync_gender_presenting_label depends on it. Not collapsed in T4.'
WHERE field_key = 'identity.gender';

-- DOB is excluded from System B entirely (the legacy mirror owns identity.dob
-- value rows from value_date; a column-backfill would collide) AND is
-- query-critical (directory age facet filters talent_profiles.date_of_birth).
UPDATE public.profile_field_definitions
SET note = 'CARVE-OUT (T4): talent_profiles.date_of_birth column is KEPT BY DESIGN. '
           || 'identity.dob value rows are owned by the legacy mirror (sourced from '
           || 'value_date, NOT the column) — a column dual-write would corrupt them. '
           || 'DOB is also query-critical (directory age facet filters the column).'
WHERE field_key = 'identity.dob';

COMMIT;

-- ─── Archive the soon-to-be-dropped columns (recovery net) ──────────────────
-- One archive table per source table, keyed by the row id so a future restore
-- can re-attach the values. CREATE TABLE AS is non-transactional-friendly but
-- safe to run standalone; kept outside the carve-out txn above.

CREATE TABLE IF NOT EXISTS public.talent_profiles_dropped_cols_archive_20261023 AS
SELECT
  id,
  tagline,
  bio_tone,
  response_time,
  rate_card_visibility,
  ask_for_quote,
  travel_included,
  lodging_included,
  age_display_mode,
  passport_status,
  drivers_license,
  pronouns,
  pronouns_custom,
  bios,
  personality_traits,
  rates_data,
  package_rates_data,
  rate_tiers_data,
  credits_data,
  limits_data,
  social_proof_data,
  work_eligibility,
  upcoming_visits,
  media_albums_data,
  documents_data
FROM public.talent_profiles;

CREATE TABLE IF NOT EXISTS public.agency_talent_roster_dropped_cols_archive_20261023 AS
SELECT
  id,
  talent_profile_id,
  tenant_id,
  internal_notes,
  emergency_contact,
  field_locks_data
FROM public.agency_talent_roster;

-- ─── DROP the migrated columns ──────────────────────────────────────────────
-- talent_profiles (22 columns): Tier-A scalars (10), Tier-B blobs (12 minus the
-- ones overlapping below = all 12), Tier-C pronouns + pronouns_custom (2).
-- Single-column CHECK constraints drop automatically with their column.

-- Tier-A scalars
ALTER TABLE public.talent_profiles DROP COLUMN IF EXISTS tagline;
ALTER TABLE public.talent_profiles DROP COLUMN IF EXISTS bio_tone;
ALTER TABLE public.talent_profiles DROP COLUMN IF EXISTS response_time;
ALTER TABLE public.talent_profiles DROP COLUMN IF EXISTS rate_card_visibility;
ALTER TABLE public.talent_profiles DROP COLUMN IF EXISTS ask_for_quote;
ALTER TABLE public.talent_profiles DROP COLUMN IF EXISTS travel_included;
ALTER TABLE public.talent_profiles DROP COLUMN IF EXISTS lodging_included;
ALTER TABLE public.talent_profiles DROP COLUMN IF EXISTS age_display_mode;
ALTER TABLE public.talent_profiles DROP COLUMN IF EXISTS passport_status;
ALTER TABLE public.talent_profiles DROP COLUMN IF EXISTS drivers_license;

-- Tier-B JSONB blobs
ALTER TABLE public.talent_profiles DROP COLUMN IF EXISTS bios;
ALTER TABLE public.talent_profiles DROP COLUMN IF EXISTS personality_traits;
ALTER TABLE public.talent_profiles DROP COLUMN IF EXISTS rates_data;
ALTER TABLE public.talent_profiles DROP COLUMN IF EXISTS package_rates_data;
ALTER TABLE public.talent_profiles DROP COLUMN IF EXISTS rate_tiers_data;
ALTER TABLE public.talent_profiles DROP COLUMN IF EXISTS credits_data;
ALTER TABLE public.talent_profiles DROP COLUMN IF EXISTS limits_data;
ALTER TABLE public.talent_profiles DROP COLUMN IF EXISTS social_proof_data;
ALTER TABLE public.talent_profiles DROP COLUMN IF EXISTS work_eligibility;
ALTER TABLE public.talent_profiles DROP COLUMN IF EXISTS upcoming_visits;
ALTER TABLE public.talent_profiles DROP COLUMN IF EXISTS media_albums_data;
ALTER TABLE public.talent_profiles DROP COLUMN IF EXISTS documents_data;

-- Tier-C identity-PII (pronouns + pronouns_custom). gender + date_of_birth are
-- KEPT carve-outs (NOT dropped).
ALTER TABLE public.talent_profiles DROP COLUMN IF EXISTS pronouns;
ALTER TABLE public.talent_profiles DROP COLUMN IF EXISTS pronouns_custom;

-- agency_talent_roster (3 columns): Tier-D roster-scoped fields.
ALTER TABLE public.agency_talent_roster DROP COLUMN IF EXISTS internal_notes;
ALTER TABLE public.agency_talent_roster DROP COLUMN IF EXISTS emergency_contact;
ALTER TABLE public.agency_talent_roster DROP COLUMN IF EXISTS field_locks_data;
