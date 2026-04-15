-- Phase 2: inquiry_offers, line_items, inquiry_approvals, FK current_offer, booking lifecycle columns

BEGIN;

DO $$ BEGIN
  CREATE TYPE public.inquiry_offer_status AS ENUM (
    'draft', 'sent', 'accepted', 'rejected', 'superseded', 'invalidated'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.inquiry_approval_status AS ENUM ('pending', 'accepted', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.inquiry_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id UUID NOT NULL REFERENCES public.inquiries(id) ON DELETE CASCADE,
  version INT NOT NULL DEFAULT 1,
  status public.inquiry_offer_status NOT NULL DEFAULT 'draft',
  total_client_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  coordinator_fee NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency_code TEXT NOT NULL DEFAULT 'MXN',
  notes TEXT,
  valid_until TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  rejection_reason TEXT CHECK (rejection_reason IS NULL OR rejection_reason IN (
    'too_expensive', 'wrong_talent', 'timing', 'changed_plans', 'other'
  )),
  rejection_reason_text TEXT,
  created_by_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS inquiry_offers_one_live_commercial
  ON public.inquiry_offers (inquiry_id)
  WHERE status IN ('sent', 'accepted');

CREATE INDEX IF NOT EXISTS idx_offers_inquiry
  ON public.inquiry_offers (inquiry_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.inquiry_offer_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id UUID NOT NULL REFERENCES public.inquiry_offers(id) ON DELETE CASCADE,
  talent_profile_id UUID REFERENCES public.talent_profiles(id) ON DELETE SET NULL,
  label TEXT,
  pricing_unit public.pricing_unit NOT NULL DEFAULT 'event',
  units NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  talent_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.inquiry_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id UUID NOT NULL REFERENCES public.inquiries(id) ON DELETE CASCADE,
  offer_id UUID REFERENCES public.inquiry_offers(id) ON DELETE SET NULL,
  participant_id UUID NOT NULL REFERENCES public.inquiry_participants(id) ON DELETE CASCADE,
  status public.inquiry_approval_status NOT NULL DEFAULT 'pending',
  decided_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (inquiry_id, offer_id, participant_id)
);

CREATE INDEX IF NOT EXISTS idx_approvals_inquiry_offer
  ON public.inquiry_approvals (inquiry_id, offer_id, status);

-- FK for current_offer_id (nullable)
DO $$ BEGIN
  ALTER TABLE public.inquiries
    ADD CONSTRAINT fk_inquiries_current_offer
    FOREIGN KEY (current_offer_id) REFERENCES public.inquiry_offers(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Talent-scoped line item view (security invoker pattern: query via service role + app filters talent)
CREATE OR REPLACE VIEW public.inquiry_offer_line_items_talent_view AS
SELECT
  li.id,
  li.offer_id,
  li.talent_profile_id,
  li.label,
  li.pricing_unit,
  li.units,
  li.talent_cost,
  li.notes,
  li.sort_order,
  li.created_at
FROM public.inquiry_offer_line_items li;

ALTER TABLE public.inquiry_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inquiry_offer_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inquiry_approvals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inquiry_offers_staff ON public.inquiry_offers;
CREATE POLICY inquiry_offers_staff ON public.inquiry_offers
  FOR ALL USING (public.is_agency_staff()) WITH CHECK (public.is_agency_staff());

DROP POLICY IF EXISTS inquiry_offer_line_items_staff ON public.inquiry_offer_line_items;
CREATE POLICY inquiry_offer_line_items_staff ON public.inquiry_offer_line_items
  FOR ALL USING (public.is_agency_staff()) WITH CHECK (public.is_agency_staff());

DROP POLICY IF EXISTS inquiry_approvals_staff ON public.inquiry_approvals;
CREATE POLICY inquiry_approvals_staff ON public.inquiry_approvals
  FOR ALL USING (public.is_agency_staff()) WITH CHECK (public.is_agency_staff());

-- Booking: revenue lifecycle (distinct from existing payment_status enum column)
ALTER TABLE public.agency_bookings
  ADD COLUMN IF NOT EXISTS client_revenue_lifecycle TEXT NOT NULL DEFAULT 'pending'
    CHECK (client_revenue_lifecycle IN ('pending', 'deposit_paid', 'fully_paid', 'refunded', 'failed')),
  ADD COLUMN IF NOT EXISTS payout_lifecycle TEXT NOT NULL DEFAULT 'pending'
    CHECK (payout_lifecycle IN ('pending', 'scheduled', 'paid')),
  ADD COLUMN IF NOT EXISTS source_type_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS tenant_id_snapshot UUID,
  ADD COLUMN IF NOT EXISTS coordinator_user_id_snapshot UUID,
  ADD COLUMN IF NOT EXISTS owner_user_id_snapshot UUID,
  ADD COLUMN IF NOT EXISTS event_timezone_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS coordinator_response_time_ms BIGINT,
  ADD COLUMN IF NOT EXISTS time_to_first_offer_ms BIGINT,
  ADD COLUMN IF NOT EXISTS time_to_booking_ms BIGINT;

-- One booking per inquiry for new-engine conversions is enforced in application code
-- (legacy rows may have multiple bookings per source inquiry).

COMMIT;
