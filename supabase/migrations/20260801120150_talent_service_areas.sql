-- Talent service areas — first-class structured travel/service-area model.
--
-- Today, location is split across:
--   - talent_profiles.location_id (single base city, FK to public.locations)
--   - talent_profiles.destinations TEXT[] (M8 free-text travel chips)
--   - talent_profiles.travels_globally BOOLEAN
--
-- That's enough to render M8 editorial cards but it's not enough to filter
-- the directory by "talent who can work in Tulum" or to feed the AI search
-- with structured signals. This migration introduces a proper junction table
-- between talent_profiles and locations.
--
-- Compatibility shim:
--   - talent_profiles.destinations TEXT[] stays as a derived denormalized
--     cache (an array of location display_name_en strings).
--   - A trigger on talent_service_areas keeps the cache in sync. Existing
--     M8 directory cards / editorial renderers keep working without rewrite.
--   - Backfill (next migration) populates home_base from talent_profiles
--     .location_id and travel_to rows from destinations TEXT[].
--
-- Tenant-aware RLS from day one.
--
-- DOWN (manual):
--   DROP TRIGGER IF EXISTS trg_talent_service_areas_refresh_cache ON public.talent_service_areas;
--   DROP TRIGGER IF EXISTS trg_talent_service_areas_touch_updated_at ON public.talent_service_areas;
--   DROP FUNCTION IF EXISTS public.refresh_talent_profile_destinations_cache();
--   DROP FUNCTION IF EXISTS public.talent_service_areas_touch_updated_at();
--   DROP TABLE IF EXISTS public.talent_service_areas;

BEGIN;

CREATE TABLE IF NOT EXISTS public.talent_service_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.agencies(id) ON DELETE CASCADE,
  talent_profile_id UUID NOT NULL REFERENCES public.talent_profiles(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
  service_kind TEXT NOT NULL DEFAULT 'travel_to'
    CHECK (service_kind IN ('home_base','travel_to','remote_only')),
  travel_radius_km INTEGER CHECK (travel_radius_km IS NULL OR travel_radius_km BETWEEN 0 AND 25000),
  travel_fee_required BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (talent_profile_id, location_id, service_kind)
);

-- At most one home_base per profile. Travel_to and remote_only have no cap.
CREATE UNIQUE INDEX IF NOT EXISTS ux_talent_service_areas_one_home_base
  ON public.talent_service_areas (talent_profile_id)
  WHERE service_kind = 'home_base';

CREATE INDEX IF NOT EXISTS idx_talent_service_areas_profile
  ON public.talent_service_areas (talent_profile_id);

CREATE INDEX IF NOT EXISTS idx_talent_service_areas_location
  ON public.talent_service_areas (location_id);

CREATE INDEX IF NOT EXISTS idx_talent_service_areas_tenant
  ON public.talent_service_areas (tenant_id)
  WHERE tenant_id IS NOT NULL;

-- ─── updated_at trigger ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.talent_service_areas_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_talent_service_areas_touch_updated_at
  ON public.talent_service_areas;

CREATE TRIGGER trg_talent_service_areas_touch_updated_at
  BEFORE UPDATE ON public.talent_service_areas
  FOR EACH ROW EXECUTE FUNCTION public.talent_service_areas_touch_updated_at();

-- ─── destinations[] cache refresh trigger ──────────────────────────────────
-- Refreshes talent_profiles.destinations as the array of display_name_en
-- values for all travel_to + home_base rows tied to the profile, ordered by
-- display_order then name. Keeps M8 editorial code working without rewrite.
CREATE OR REPLACE FUNCTION public.refresh_talent_profile_destinations_cache()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  affected_profile UUID;
BEGIN
  affected_profile := COALESCE(NEW.talent_profile_id, OLD.talent_profile_id);

  UPDATE public.talent_profiles AS tp
     SET destinations = COALESCE((
           SELECT array_agg(loc.display_name_en ORDER BY tsa.display_order, loc.display_name_en)
             FROM public.talent_service_areas tsa
             JOIN public.locations loc ON loc.id = tsa.location_id
            WHERE tsa.talent_profile_id = affected_profile
              AND tsa.service_kind IN ('home_base','travel_to')
         ), ARRAY[]::TEXT[])
   WHERE tp.id = affected_profile;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_talent_service_areas_refresh_cache
  ON public.talent_service_areas;

CREATE TRIGGER trg_talent_service_areas_refresh_cache
  AFTER INSERT OR UPDATE OR DELETE ON public.talent_service_areas
  FOR EACH ROW EXECUTE FUNCTION public.refresh_talent_profile_destinations_cache();

-- Trigger is created enabled. Backfill migration disables it briefly so the
-- bulk load doesn't trigger N updates per profile, then re-enables and runs
-- a single resync.

-- ─── RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE public.talent_service_areas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS talent_service_areas_select_public ON public.talent_service_areas;
CREATE POLICY talent_service_areas_select_public ON public.talent_service_areas
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.talent_profiles tp
       WHERE tp.id = talent_service_areas.talent_profile_id
         AND tp.deleted_at IS NULL
         AND tp.workflow_status = 'approved'
         AND tp.visibility = 'public'
    )
  );

DROP POLICY IF EXISTS talent_service_areas_select_own ON public.talent_service_areas;
CREATE POLICY talent_service_areas_select_own ON public.talent_service_areas
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.talent_profiles tp
       WHERE tp.id = talent_service_areas.talent_profile_id
         AND tp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS talent_service_areas_select_staff ON public.talent_service_areas;
CREATE POLICY talent_service_areas_select_staff ON public.talent_service_areas
  FOR SELECT
  USING (
    public.is_agency_staff()
    OR (tenant_id IS NOT NULL AND public.is_staff_of_tenant(tenant_id))
  );

DROP POLICY IF EXISTS talent_service_areas_write_own_or_staff ON public.talent_service_areas;
CREATE POLICY talent_service_areas_write_own_or_staff ON public.talent_service_areas
  FOR ALL
  USING (
    public.is_agency_staff()
    OR (tenant_id IS NOT NULL AND public.is_staff_of_tenant(tenant_id))
    OR EXISTS (
      SELECT 1 FROM public.talent_profiles tp
       WHERE tp.id = talent_service_areas.talent_profile_id
         AND tp.user_id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_agency_staff()
    OR (tenant_id IS NOT NULL AND public.is_staff_of_tenant(tenant_id))
    OR EXISTS (
      SELECT 1 FROM public.talent_profiles tp
       WHERE tp.id = talent_service_areas.talent_profile_id
         AND tp.user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.talent_service_areas IS
  'Where a talent works. service_kind=home_base is the single base city; travel_to are additional cities; remote_only flags virtual-only services. Cache: refreshes talent_profiles.destinations TEXT[] on write so M8 editorial code keeps reading the cache.';
COMMENT ON COLUMN public.talent_service_areas.service_kind IS
  'home_base = primary location (max 1 per profile); travel_to = additional cities; remote_only = virtual / non-physical.';
COMMENT ON COLUMN public.talent_service_areas.travel_radius_km IS
  'Optional travel radius from this location, in km. Used by directory radius filters.';

COMMIT;
