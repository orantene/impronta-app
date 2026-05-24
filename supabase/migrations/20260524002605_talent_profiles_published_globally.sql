-- Platform Users Control Center — M0.3
-- Adds three columns to talent_profiles to support platform-level publish/hide control:
--
--   published_globally  boolean  — platform-wide visibility switch (true = show globally)
--   hidden_at           timestamptz — timestamp when a platform admin hid this profile
--   hidden_by_user_id   uuid     — which platform admin user performed the hide
--
-- Authoritative status column: workflow_status (enum profile_workflow_status)
-- Values: draft | submitted | under_review | approved | published | hidden | archived
--
-- Backfill logic:
--   A talent is considered "published globally" if their workflow_status is one of
--   'approved' or 'published' — the two states that indicate the profile has passed
--   review and is intended to be visible. All other statuses (draft, submitted,
--   under_review, hidden, archived) default to false (not globally visible).
--   Conservative default chosen: if workflow_status is NULL or unrecognised, default to false.
--
-- NOTE: This column is a platform-level override distinct from:
--   - is_discoverable (talent's own opt-in to the cross-tenant Discover catalog)
--   - agency_talent_roster.feature_in_directory (per-roster admin boost)
--   - workflow_status itself (the editorial pipeline state)
-- The old status column is NOT dropped here — that is a separate cleanup pass.

ALTER TABLE public.talent_profiles
  ADD COLUMN IF NOT EXISTS published_globally BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE public.talent_profiles
  ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ;

ALTER TABLE public.talent_profiles
  ADD COLUMN IF NOT EXISTS hidden_by_user_id UUID
    REFERENCES auth.users(id) ON DELETE SET NULL;

-- Backfill: mark profiles as published_globally only when workflow_status indicates
-- they have been approved or explicitly published. All others are set to false.
UPDATE public.talent_profiles
SET published_globally = (workflow_status IN ('approved', 'published'))
WHERE TRUE; -- explicit WHERE to signal intentional full-table update

-- Index for platform admin queries that filter on published_globally
CREATE INDEX IF NOT EXISTS idx_talent_profiles_published_globally
  ON public.talent_profiles (published_globally);

-- Index for audit queries — who hid what and when
CREATE INDEX IF NOT EXISTS idx_talent_profiles_hidden_at
  ON public.talent_profiles (hidden_at)
  WHERE hidden_at IS NOT NULL;

COMMENT ON COLUMN public.talent_profiles.published_globally IS
  'Platform-level global visibility switch. true = profile is visible across the platform. '
  'Backfilled from workflow_status IN (approved, published). '
  'Platform admins can set this false to hide a profile without changing its editorial workflow_status. '
  'Distinct from is_discoverable (talent Discover opt-in) and feature_in_directory (per-roster boost). '
  'See: web/docs/platform-users-control-center-plan-2026-05-23.md §10 row M0.3.';

COMMENT ON COLUMN public.talent_profiles.hidden_at IS
  'Timestamp when a platform admin set published_globally = false via the Control Center. '
  'NULL if the profile has never been platform-hidden (even if published_globally is false due to backfill). '
  'Set alongside hidden_by_user_id when a hide action is performed.';

COMMENT ON COLUMN public.talent_profiles.hidden_by_user_id IS
  'auth.users.id of the platform admin who last set published_globally = false. '
  'NULL until a platform hide action is recorded. ON DELETE SET NULL to survive user deletion.';
