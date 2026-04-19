-- SaaS Phase 1 / P1.A.10 — talent_profiles provenance columns.
--
-- Ref: docs/saas/phase-0/01-entity-ownership-map.md §2 + §10,
--      Plan §4 (Ownership Model — provenance required on shared records),
--      Plan §4.5 (Schema Impact Map — existing tables adjustment).
--
-- Backfills existing rows with source_type='legacy'. created_by_agency_id +
-- created_by_user_id_provenance stay NULL for legacy rows (their provenance
-- predates the concept). Kept nullable in Phase 1; later phases populate as
-- agency-created flows come online.

BEGIN;

ALTER TABLE public.talent_profiles
  ADD COLUMN IF NOT EXISTS created_by_agency_id UUID
    REFERENCES public.agencies(id) ON DELETE SET NULL;

ALTER TABLE public.talent_profiles
  ADD COLUMN IF NOT EXISTS created_by_user_id_provenance UUID
    REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.talent_profiles
  ADD COLUMN IF NOT EXISTS source_type TEXT
    CHECK (source_type IN (
      'legacy','agency_created','freelancer_signup','platform_import','bulk_import'
    ));

-- Backfill: everything existing is 'legacy'.
UPDATE public.talent_profiles
   SET source_type = 'legacy'
 WHERE source_type IS NULL;

-- No SET NOT NULL in Phase 1 — the CHECK constraint allows NULL, and future
-- agency-created flows will populate. We may tighten in Phase 6/7 once all
-- creation paths route through provenance-aware RPCs.

CREATE INDEX IF NOT EXISTS talent_profiles_source_type_idx
  ON public.talent_profiles (source_type);

CREATE INDEX IF NOT EXISTS talent_profiles_created_by_agency_idx
  ON public.talent_profiles (created_by_agency_id)
  WHERE created_by_agency_id IS NOT NULL;

COMMENT ON COLUMN public.talent_profiles.source_type IS
  'Provenance flag: legacy (pre-SaaS) / agency_created / freelancer_signup / platform_import / bulk_import. Required on all rows from Phase 6 onwards (currently nullable; legacy rows carry ''legacy'').';

COMMIT;
