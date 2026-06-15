-- Remove dead city/country taxonomy terms (2026-06-15).
--
-- `taxonomy_terms` of term_type='attribute' held a parallel geo-seed
-- (kind='location_city' 122 rows + kind='location_country' 44 rows = 166) that
-- mirrored the canonical `locations` table. Location everywhere — the curated
-- city field (/api/location-cities), the roster service-area editor, and the
-- directory location facet (directory-filter-sections.ts, which explicitly
-- SKIPS kind location_city/location_country) — reads the `locations` table, NOT
-- these terms. They had 0 talent assignments, 0 field-recommendation refs, and
-- is_public_filter=false. Genuine attribute badges (kind='tag' 32 + 'fit_label'
-- 27, which talents DO use) are untouched.
--
-- FK cleanup is automatic: agency_taxonomy_settings (3818 rows) cascade-deletes.
-- Rows were archived to public._archive_location_taxonomy_terms_20260615 +
-- _archive_location_agency_settings_20260615 before deletion (reversible).
-- Idempotent.

delete from public.taxonomy_terms
  where term_type = 'attribute'
    and kind in ('location_city', 'location_country');
