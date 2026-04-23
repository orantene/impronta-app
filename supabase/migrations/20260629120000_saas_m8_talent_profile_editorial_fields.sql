-- M8 — editorial profile fields for Muse Bridal + future editorial verticals.
--
-- Additive columns on talent_profiles. All nullable so legacy rows continue
-- to parse. Tenant-isolation is inherited from existing RLS on
-- talent_profiles; no new policies needed.
--
-- Why columns and not a side table:
--   - These fields are 1:1 with a talent profile.
--   - Arrays (text[]) and small JSONB blobs (social_links, embedded_media,
--     package_teasers) index fine in Postgres without a separate table.
--   - Existing admin talent form is column-driven; a side table would
--     complicate the form with no payoff at this tenant scale.

ALTER TABLE public.talent_profiles
  ADD COLUMN IF NOT EXISTS intro_italic TEXT,
  ADD COLUMN IF NOT EXISTS event_styles TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS destinations TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS languages TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS travels_globally BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS team_size TEXT,
  ADD COLUMN IF NOT EXISTS lead_time_weeks TEXT,
  ADD COLUMN IF NOT EXISTS starting_from TEXT,
  ADD COLUMN IF NOT EXISTS booking_note TEXT,
  ADD COLUMN IF NOT EXISTS package_teasers JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS social_links JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS embedded_media JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS service_category_slug TEXT;

COMMENT ON COLUMN public.talent_profiles.intro_italic IS
  'M8 — short italic-serif introduction line shown under the name on editorial profile variants.';
COMMENT ON COLUMN public.talent_profiles.event_styles IS
  'M8 — event style chips (e.g. ''Beachfront ceremonies'', ''Editorial weddings''). Renders on editorial-bridal profile.';
COMMENT ON COLUMN public.talent_profiles.destinations IS
  'M8 — destination availability chips (e.g. ''Tulum'', ''Ibiza'').';
COMMENT ON COLUMN public.talent_profiles.languages IS
  'M8 — languages spoken. Was previously via field_values; now first-class for editorial rendering.';
COMMENT ON COLUMN public.talent_profiles.travels_globally IS
  'M8 — toggles the Destination-Ready ribbon on directory card + profile hero (when tenant has directory.card.show-destination-ready-ribbon=on).';
COMMENT ON COLUMN public.talent_profiles.team_size IS
  'M8 — free-text team size (e.g. ''1–3 artists'', ''Solo + assistant'').';
COMMENT ON COLUMN public.talent_profiles.lead_time_weeks IS
  'M8 — free-text lead time (e.g. ''8–12 weeks'').';
COMMENT ON COLUMN public.talent_profiles.starting_from IS
  'M8 — display-only starting price (e.g. ''From US$1,400''). No computation.';
COMMENT ON COLUMN public.talent_profiles.booking_note IS
  'M8 — booking-lead-time caveat / inclusion note.';
COMMENT ON COLUMN public.talent_profiles.package_teasers IS
  'M8 — array of {label, detail} objects. Shown on editorial profile packages card.';
COMMENT ON COLUMN public.talent_profiles.social_links IS
  'M8 — array of {label, href} objects for external portfolios / social.';
COMMENT ON COLUMN public.talent_profiles.embedded_media IS
  'M8 — array of {provider: ''spotify''|''soundcloud''|''vimeo''|''youtube'', url, label?}. For music/performance profiles.';
COMMENT ON COLUMN public.talent_profiles.service_category_slug IS
  'M8 — editorial primary category slug (e.g. ''bridal-makeup''). Distinct from talent_profile_taxonomy which is a multi-select.';
