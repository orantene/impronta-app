-- Phase 2: inquiry_participants + RLS + invariant indexes

BEGIN;

DO $$ BEGIN
  CREATE TYPE public.inquiry_participant_role AS ENUM ('client', 'coordinator', 'talent');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.inquiry_participant_status AS ENUM ('invited', 'active', 'declined', 'removed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.inquiry_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id UUID NOT NULL REFERENCES public.inquiries(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  talent_profile_id UUID REFERENCES public.talent_profiles(id) ON DELETE SET NULL,
  role public.inquiry_participant_role NOT NULL,
  status public.inquiry_participant_status NOT NULL DEFAULT 'invited',
  accepted_at TIMESTAMPTZ,
  removed_at TIMESTAMPTZ,
  decline_reason TEXT CHECK (decline_reason IS NULL OR decline_reason IN (
    'unavailable', 'rate_too_low', 'scheduling_conflict', 'not_interested', 'other'
  )),
  decline_reason_text TEXT,
  added_by_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique per (inquiry, user, role) when user_id set; talent rows may use talent_profile_id
CREATE UNIQUE INDEX IF NOT EXISTS inquiry_participants_inquiry_user_role_unique
  ON public.inquiry_participants (inquiry_id, user_id, role)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS inquiry_participants_one_active_coordinator
  ON public.inquiry_participants (inquiry_id)
  WHERE role = 'coordinator' AND status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS inquiry_participants_active_talent_unique
  ON public.inquiry_participants (inquiry_id, talent_profile_id)
  WHERE role = 'talent' AND talent_profile_id IS NOT NULL
    AND status IN ('invited', 'active');

CREATE INDEX IF NOT EXISTS idx_participants_inquiry_role
  ON public.inquiry_participants (inquiry_id, role, status);
CREATE INDEX IF NOT EXISTS idx_participants_user
  ON public.inquiry_participants (user_id, status)
  WHERE user_id IS NOT NULL;

ALTER TABLE public.inquiry_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inquiry_participants_staff ON public.inquiry_participants;
CREATE POLICY inquiry_participants_staff ON public.inquiry_participants
  FOR ALL USING (public.is_agency_staff()) WITH CHECK (public.is_agency_staff());

COMMIT;
