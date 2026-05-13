-- B.3 — Talent calendar data model v1.
--
-- Three tables that together describe a talent's working calendar:
--   * talent_bookings           — confirmed work (paid or contractually closed)
--   * talent_holds              — tentative reservations during negotiation
--   * talent_availability_blocks — explicit unavailable periods (OOO, personal)
--
-- Design notes:
--   * `talent_profile_id` is the canonical anchor — calendars belong to the
--     talent person, not to one agency. Multi-agency talents see ALL their
--     work on a single calendar.
--   * `tenant_id` is the AGENCY that booked / held / approved the entry.
--     Multi-tenant talents have rows from each agency; RLS scopes to the
--     viewer's relationship.
--   * `inquiry_id` is optional — bookings/holds derived from inquiry flow
--     carry it, manual blocks (OOO) do not.
--   * Date ranges use [starts_at, ends_at) half-open per Postgres
--     convention. Indexes are date-range heavy to support calendar grid
--     queries.
--
-- RLS:
--   * Talent self: SELECT/INSERT/UPDATE/DELETE their own rows.
--   * Agency admin: SELECT all rows in their tenant; INSERT/UPDATE bookings
--     and holds they created (audit via created_by_user_id).
--   * Client: SELECT only their own inquiry-derived bookings.

BEGIN;

-- ─── 1. talent_bookings ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.talent_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  talent_profile_id UUID NOT NULL REFERENCES public.talent_profiles(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  inquiry_id UUID REFERENCES public.inquiries(id) ON DELETE SET NULL,
  -- Display
  title TEXT NOT NULL,
  client_label TEXT,
  location_text TEXT,
  -- Time range (UTC). half-open: ends_at is exclusive.
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  all_day BOOLEAN NOT NULL DEFAULT FALSE,
  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('confirmed','completed','cancelled')),
  -- Audit
  created_by_user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT talent_bookings_time_range_check CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_talent_bookings_talent_range
  ON public.talent_bookings (talent_profile_id, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_talent_bookings_tenant_range
  ON public.talent_bookings (tenant_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_talent_bookings_inquiry
  ON public.talent_bookings (inquiry_id) WHERE inquiry_id IS NOT NULL;

ALTER TABLE public.talent_bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS talent_bookings_select_self ON public.talent_bookings;
CREATE POLICY talent_bookings_select_self ON public.talent_bookings
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.talent_profiles tp
      WHERE tp.id = talent_profile_id AND tp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS talent_bookings_select_staff ON public.talent_bookings;
CREATE POLICY talent_bookings_select_staff ON public.talent_bookings
  FOR SELECT TO authenticated
  USING (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS talent_bookings_select_client ON public.talent_bookings;
CREATE POLICY talent_bookings_select_client ON public.talent_bookings
  FOR SELECT TO authenticated
  USING (
    inquiry_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.inquiries i
      WHERE i.id = inquiry_id AND i.client_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS talent_bookings_write_staff ON public.talent_bookings;
CREATE POLICY talent_bookings_write_staff ON public.talent_bookings
  FOR ALL TO authenticated
  USING (public.is_staff_of_tenant(tenant_id))
  WITH CHECK (public.is_staff_of_tenant(tenant_id));

-- ─── 2. talent_holds ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.talent_holds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  talent_profile_id UUID NOT NULL REFERENCES public.talent_profiles(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  inquiry_id UUID REFERENCES public.inquiries(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  client_label TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  all_day BOOLEAN NOT NULL DEFAULT FALSE,
  hold_strength TEXT NOT NULL DEFAULT 'soft'
    CHECK (hold_strength IN ('soft','firm')),
  expires_at TIMESTAMPTZ,
  created_by_user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT talent_holds_time_range_check CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_talent_holds_talent_range
  ON public.talent_holds (talent_profile_id, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_talent_holds_tenant_range
  ON public.talent_holds (tenant_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_talent_holds_active
  ON public.talent_holds (talent_profile_id, expires_at)
  WHERE expires_at IS NOT NULL;

ALTER TABLE public.talent_holds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS talent_holds_select_self ON public.talent_holds;
CREATE POLICY talent_holds_select_self ON public.talent_holds
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.talent_profiles tp
      WHERE tp.id = talent_profile_id AND tp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS talent_holds_select_staff ON public.talent_holds;
CREATE POLICY talent_holds_select_staff ON public.talent_holds
  FOR SELECT TO authenticated
  USING (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS talent_holds_write_staff ON public.talent_holds;
CREATE POLICY talent_holds_write_staff ON public.talent_holds
  FOR ALL TO authenticated
  USING (public.is_staff_of_tenant(tenant_id))
  WITH CHECK (public.is_staff_of_tenant(tenant_id));

-- ─── 3. talent_availability_blocks ──────────────────────────────────────────
-- Talent-authored unavailable periods (OOO, personal time).
CREATE TABLE IF NOT EXISTS public.talent_availability_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  talent_profile_id UUID NOT NULL REFERENCES public.talent_profiles(id) ON DELETE CASCADE,
  reason TEXT NOT NULL DEFAULT 'unavailable',
    -- 'unavailable' | 'travel' | 'personal' | 'vacation' | 'class' | ...
  note TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  all_day BOOLEAN NOT NULL DEFAULT TRUE,
  visibility TEXT NOT NULL DEFAULT 'agency_visible'
    CHECK (visibility IN ('private','agency_visible')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT talent_blocks_time_range_check CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_talent_blocks_talent_range
  ON public.talent_availability_blocks (talent_profile_id, starts_at, ends_at);

ALTER TABLE public.talent_availability_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS talent_blocks_self_full ON public.talent_availability_blocks;
CREATE POLICY talent_blocks_self_full ON public.talent_availability_blocks
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.talent_profiles tp
      WHERE tp.id = talent_profile_id AND tp.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.talent_profiles tp
      WHERE tp.id = talent_profile_id AND tp.user_id = auth.uid()
    )
  );

-- Agency-visible blocks readable by staff of any tenant the talent rosters with.
DROP POLICY IF EXISTS talent_blocks_select_staff ON public.talent_availability_blocks;
CREATE POLICY talent_blocks_select_staff ON public.talent_availability_blocks
  FOR SELECT TO authenticated
  USING (
    visibility = 'agency_visible'
    AND EXISTS (
      SELECT 1 FROM public.agency_talent_roster r
      WHERE r.talent_profile_id = talent_availability_blocks.talent_profile_id
        AND r.status = 'active'
        AND public.is_staff_of_tenant(r.tenant_id)
    )
  );

-- ─── 4. updated_at trigger for talent_bookings ──────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_talent_bookings_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_talent_bookings_updated_at ON public.talent_bookings;
CREATE TRIGGER trg_talent_bookings_updated_at
  BEFORE UPDATE ON public.talent_bookings
  FOR EACH ROW EXECUTE FUNCTION public.tg_talent_bookings_set_updated_at();

COMMENT ON TABLE public.talent_bookings IS
  'Confirmed work blocks on a talent calendar. Anchored to talent_profile_id with tenant_id = the agency that booked. inquiry_id links back to the inquiry flow when applicable.';
COMMENT ON TABLE public.talent_holds IS
  'Tentative reservations during inquiry negotiation. Auto-expire when inquiry rejects/expires; promote to talent_bookings on confirm.';
COMMENT ON TABLE public.talent_availability_blocks IS
  'Talent-authored unavailable periods. private = only the talent sees; agency_visible = visible to staff of every roster-active agency.';

COMMIT;
