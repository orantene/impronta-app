-- Phase 2: inquiry lifecycle enum extension + inquiries columns + failed_engine_effects + indexes

BEGIN;

-- inquiry_status: canonical workflow values (compatibility-first; legacy values remain)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'inquiry_status' AND e.enumlabel = 'draft') THEN
    ALTER TYPE public.inquiry_status ADD VALUE 'draft';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'inquiry_status' AND e.enumlabel = 'submitted') THEN
    ALTER TYPE public.inquiry_status ADD VALUE 'submitted';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'inquiry_status' AND e.enumlabel = 'coordination') THEN
    ALTER TYPE public.inquiry_status ADD VALUE 'coordination';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'inquiry_status' AND e.enumlabel = 'offer_pending') THEN
    ALTER TYPE public.inquiry_status ADD VALUE 'offer_pending';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'inquiry_status' AND e.enumlabel = 'approved') THEN
    ALTER TYPE public.inquiry_status ADD VALUE 'approved';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'inquiry_status' AND e.enumlabel = 'booked') THEN
    ALTER TYPE public.inquiry_status ADD VALUE 'booked';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'inquiry_status' AND e.enumlabel = 'rejected') THEN
    ALTER TYPE public.inquiry_status ADD VALUE 'rejected';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'inquiry_status' AND e.enumlabel = 'expired') THEN
    ALTER TYPE public.inquiry_status ADD VALUE 'expired';
  END IF;
END $$;

ALTER TABLE public.inquiries
  ADD COLUMN IF NOT EXISTS uses_new_engine BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'agency'
    CHECK (source_type IN ('agency', 'hub')),
  ADD COLUMN IF NOT EXISTS tenant_id UUID,
  ADD COLUMN IF NOT EXISTS coordinator_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS coordinator_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS coordinator_assigned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_action_by TEXT
    CHECK (next_action_by IS NULL OR next_action_by IN ('client', 'coordinator', 'talent', 'system')),
  ADD COLUMN IF NOT EXISTS current_offer_id UUID,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS booked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  ADD COLUMN IF NOT EXISTS event_timezone TEXT,
  ADD COLUMN IF NOT EXISTS close_reason TEXT
    CHECK (close_reason IS NULL OR close_reason IN (
      'budget', 'timing', 'talent_mismatch', 'client_unresponsive', 'duplicate', 'spam', 'other'
    )),
  ADD COLUMN IF NOT EXISTS close_reason_text TEXT,
  ADD COLUMN IF NOT EXISTS closed_by_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS has_failed_effects BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_edited_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_edited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_frozen BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS frozen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS frozen_by_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS freeze_reason TEXT;

-- Backfill coordinator from assigned_staff_id
UPDATE public.inquiries
SET coordinator_id = assigned_staff_id
WHERE coordinator_id IS NULL AND assigned_staff_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inquiries_status_priority
  ON public.inquiries (status, priority, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inquiries_next_action_by
  ON public.inquiries (next_action_by, status)
  WHERE next_action_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inquiries_coordinator
  ON public.inquiries (coordinator_id, status)
  WHERE coordinator_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inquiries_owner
  ON public.inquiries (owner_user_id, status)
  WHERE owner_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inquiries_uses_new_engine
  ON public.inquiries (uses_new_engine)
  WHERE uses_new_engine = true;

-- failed_engine_effects (retry queue for post-commit listener failures)
CREATE TABLE IF NOT EXISTS public.failed_engine_effects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id UUID NOT NULL REFERENCES public.inquiries(id) ON DELETE CASCADE,
  event_id UUID NOT NULL DEFAULT gen_random_uuid(),
  listener_name TEXT NOT NULL,
  engine_action TEXT NOT NULL,
  failed_step TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  retried_at TIMESTAMPTZ,
  resolved BOOLEAN NOT NULL DEFAULT false,
  attempt_count INT NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_failed_effects_event_listener
  ON public.failed_engine_effects (event_id, listener_name);

CREATE INDEX IF NOT EXISTS idx_failed_effects_retry
  ON public.failed_engine_effects (resolved, priority, created_at)
  WHERE resolved = false;

ALTER TABLE public.failed_engine_effects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS failed_engine_effects_staff ON public.failed_engine_effects;
CREATE POLICY failed_engine_effects_staff ON public.failed_engine_effects
  FOR ALL USING (public.is_agency_staff()) WITH CHECK (public.is_agency_staff());

COMMIT;
