-- Phase 5 — multi-select inquiry-coordinator talent.
--
-- A workspace can designate roster talent as default inquiry coordinators.
-- Every new inquiry then adds all of them as coordinator participants
-- (inquiry_participants role='coordinator') so they join the message
-- thread and can manage the inquiry → booking flow alongside the primary
-- coordinator resolved by assignCoordinatorFromSettings().
--
-- This migration also finishes the Layer-2 coordinator→manager role
-- rename: the agency_memberships role rename shipped earlier, but the
-- team_invite_tokens.target_role CHECK still allowed 'coordinator' and
-- not 'manager', which would reject any Manager invite at the DB.

BEGIN;

-- ── 1. agency_inquiry_coordinators ─────────────────────────────────────────
-- One row per (tenant, roster talent) designated a default inquiry
-- coordinator. Additive: the existing single agencies.default_coordinator_user_id
-- still resolves the PRIMARY coordinator; this set is added on top.
CREATE TABLE IF NOT EXISTS public.agency_inquiry_coordinators (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  talent_profile_id UUID NOT NULL REFERENCES public.talent_profiles(id) ON DELETE CASCADE,
  added_by_user_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, talent_profile_id)
);

CREATE INDEX IF NOT EXISTS idx_agency_inquiry_coordinators_tenant
  ON public.agency_inquiry_coordinators (tenant_id);

ALTER TABLE public.agency_inquiry_coordinators ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agency_inquiry_coordinators_staff_all
  ON public.agency_inquiry_coordinators;
CREATE POLICY agency_inquiry_coordinators_staff_all
  ON public.agency_inquiry_coordinators
  FOR ALL TO authenticated
  USING (public.is_staff_of_tenant(tenant_id))
  WITH CHECK (public.is_staff_of_tenant(tenant_id));

COMMENT ON TABLE public.agency_inquiry_coordinators IS
  'Phase 5 — roster talent designated as default inquiry coordinators for a '
  'workspace. Every new inquiry adds all of them as coordinator participants '
  '(inquiry_participants role=coordinator), additive to the primary '
  'coordinator from agencies.default_coordinator_user_id.';

-- ── 2. Finish coordinator→manager rename on team_invite_tokens ─────────────
-- Migrate any in-flight invite still carrying the old role name, then
-- rebuild the CHECK so 'manager' is accepted and 'coordinator' is not.
UPDATE public.team_invite_tokens
   SET target_role = 'manager'
 WHERE target_role = 'coordinator';

-- Drop whatever CHECK currently guards target_role, regardless of its name
-- (the original was an inline column CHECK; a drift migration may have
-- renamed it). Then add the canonical, manager-aware constraint.
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'public.team_invite_tokens'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%target_role%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.team_invite_tokens DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.team_invite_tokens
  ADD CONSTRAINT team_invite_tokens_target_role_check
  CHECK (target_role IN ('admin', 'manager', 'editor', 'viewer'));

COMMIT;
