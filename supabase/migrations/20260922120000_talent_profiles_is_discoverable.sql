-- Discover MVP — talent master switch for Tulala-wide cross-tenant Discover catalog.
--
-- Distinct from agency_talent_roster.feature_in_directory (which is a per-roster
-- admin "boost / pin near the top of Discover" flag). This column is the talent's
-- own enrollment toggle:
--   false = excluded from Discover catalog entirely (default)
--   true  = appears on Discover; placement determined by trust tier,
--           talent subscription tier, and per-roster feature_in_directory boost.
--
-- The Discover materialized view (planned, project_discover_unified.md §6)
-- joins on this column WHERE is_discoverable = true.
--
-- See:
--   - web/docs/discover-and-unified-inquiry-2026-05-14.md (long-form spec)
--   - memory/project_discover_unified.md (TLDR + amendments)

ALTER TABLE public.talent_profiles
  ADD COLUMN IF NOT EXISTS is_discoverable BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_talent_profiles_is_discoverable
  ON public.talent_profiles (is_discoverable)
  WHERE is_discoverable = true;

COMMENT ON COLUMN public.talent_profiles.is_discoverable IS
  'Talent master switch for Tulala-wide Discover enrollment. Default false; talent self-controls via profile editor (Identity section). Distinct from agency_talent_roster.feature_in_directory which is per-roster admin boost. Discover materialized view filters on this column.';
