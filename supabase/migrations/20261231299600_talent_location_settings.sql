-- Talent location section: address visibility, studio kind, arrival note and
-- photo, and the PRIVATE exact address.
--   address_mode: zone_only (default) | after_booking | public
--   studio_kind:  studio | home_visits | both
-- `exact_address` is private by construction: no anon or authenticated grant on
-- this table at all, so it is readable only through the service role behind an
-- owner check. The public site loader only ever selects it when
-- address_mode = 'public'.
-- Additive only. One row per talent.

CREATE TABLE IF NOT EXISTS public.talent_location_settings (
  talent_profile_id uuid PRIMARY KEY REFERENCES public.talent_profiles(id) ON DELETE CASCADE,
  address_mode text NOT NULL DEFAULT 'zone_only'
    CHECK (address_mode IN ('zone_only', 'after_booking', 'public')),
  studio_kind text NOT NULL DEFAULT 'studio'
    CHECK (studio_kind IN ('studio', 'home_visits', 'both')),
  zone_neighbourhood text CHECK (zone_neighbourhood IS NULL OR length(zone_neighbourhood) <= 120),
  arrival_note text CHECK (arrival_note IS NULL OR length(arrival_note) <= 600),
  arrival_photo_url text CHECK (arrival_photo_url IS NULL OR length(arrival_photo_url) <= 2000),
  exact_address text CHECK (exact_address IS NULL OR length(exact_address) <= 300),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.talent_location_settings.exact_address IS
  'PRIVATE. Never selected for page data, JSON-LD, links or embeds unless address_mode = public.';

ALTER TABLE public.talent_location_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.talent_location_settings FROM anon;
REVOKE ALL ON public.talent_location_settings FROM authenticated;
