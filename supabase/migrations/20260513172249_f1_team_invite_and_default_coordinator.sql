-- F.1 — Team invite + per-tenant default coordinator.
--
-- Two product additions:
--
--   1. Workspace-level "default coordinator" — the staff member who is
--      auto-assigned as coordinator on every new inquiry. Today the engine
--      reads a GLOBAL settings key `default_coordinator_user_id` (see
--      web/src/lib/inquiry/coordinator-assignment.ts) — that breaks for
--      multi-tenant deployments. Move to a per-tenant column on `agencies`.
--      Falls back to the workspace owner when unset.
--      Visible in UI only on Agency-tier (plan_key='agency' or 'network').
--
--   2. Team invite tokens — short-lived signed token rows so an invite
--      link can be sent by email + redeemed after sign-up. Uses the same
--      HMAC infrastructure as /invite/[token]; tokens carry the target
--      role + target tenant + inviter user id.
--      For now the email send itself stays stubbed (Phase 8 wires Resend
--      / Loops) — this migration covers the schema so the action can
--      generate a real token + URL ready for when email lands.

BEGIN;

-- ── 1. agencies.default_coordinator_user_id ────────────────────────────────
ALTER TABLE public.agencies
  ADD COLUMN IF NOT EXISTS default_coordinator_user_id UUID
    REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.agencies.default_coordinator_user_id IS
  'F.1 — Workspace-level default coordinator for new inquiries. Must be a profile with an active agency_memberships row in this tenant. Engine falls back to workspace owner when null. UI exposes this only on Agency-tier (plan_key=agency|network).';

-- Lightweight validation: when set, the referenced user must have an
-- active membership in this tenant. Enforce at the database via a trigger
-- so admin-tools can't accidentally point this at a stranger.
CREATE OR REPLACE FUNCTION public.agencies_assert_default_coordinator_is_member()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.default_coordinator_user_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.agency_memberships m
    JOIN public.profiles p ON p.id = m.profile_id
    WHERE m.tenant_id = NEW.id
      AND p.id = NEW.default_coordinator_user_id
      AND m.status = 'active'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'default_coordinator_user_id must be an active member of this tenant';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agencies_default_coordinator_validate ON public.agencies;
CREATE TRIGGER trg_agencies_default_coordinator_validate
  BEFORE INSERT OR UPDATE OF default_coordinator_user_id ON public.agencies
  FOR EACH ROW EXECUTE FUNCTION public.agencies_assert_default_coordinator_is_member();

-- ── 2. team_invite_tokens ──────────────────────────────────────────────────
-- One row per pending email invite. The signed token URL we email out
-- carries the row's id + an HMAC; the redeem path verifies signature,
-- looks up the row, and creates the agency_memberships entry.

CREATE TABLE IF NOT EXISTS public.team_invite_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  invited_email TEXT NOT NULL,
  target_role TEXT NOT NULL
    CHECK (target_role IN ('admin','coordinator','editor','viewer')),
  invited_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '14 days'),
  redeemed_at TIMESTAMPTZ,
  redeemed_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_invite_tokens_tenant_pending
  ON public.team_invite_tokens (tenant_id, expires_at)
  WHERE redeemed_at IS NULL AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_team_invite_tokens_email
  ON public.team_invite_tokens (lower(invited_email))
  WHERE redeemed_at IS NULL AND revoked_at IS NULL;

ALTER TABLE public.team_invite_tokens ENABLE ROW LEVEL SECURITY;

-- Staff of the tenant can manage their own pending invites.
DROP POLICY IF EXISTS team_invite_tokens_staff_all ON public.team_invite_tokens;
CREATE POLICY team_invite_tokens_staff_all ON public.team_invite_tokens
  FOR ALL TO authenticated
  USING (public.is_staff_of_tenant(tenant_id))
  WITH CHECK (public.is_staff_of_tenant(tenant_id));

-- Anonymous users (mid-redemption, post-signup before staff membership)
-- can SELECT the single row that matches their email so the redeem flow
-- can confirm the invite exists. They cannot list other tenants' rows.
DROP POLICY IF EXISTS team_invite_tokens_email_self_select ON public.team_invite_tokens;
CREATE POLICY team_invite_tokens_email_self_select ON public.team_invite_tokens
  FOR SELECT TO authenticated
  USING (
    lower(invited_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    AND redeemed_at IS NULL
    AND revoked_at IS NULL
    AND expires_at > now()
  );

COMMENT ON TABLE public.team_invite_tokens IS
  'F.1 — Pending team-member invites for an agency workspace. The signed URL we email carries the row id + HMAC; redeem path verifies and creates agency_memberships. Lives 14 days by default; revocable.';

COMMIT;
