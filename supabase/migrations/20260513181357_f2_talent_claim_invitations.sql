-- F.2 — Talent claim invitations audit log.
--
-- Tracks every claim invite the agency sends to a talent (via email or
-- SMS, when wired) so the UI can:
--   * Show "Invited 2 days ago — Resend" instead of a blind "Send invite"
--     button
--   * Display the full invite history (when / by whom / which channel)
--   * Auto-revoke older pending invites when a new one is sent
--
-- The actual delivery (email / SMS) is Phase 8. This table captures the
-- intent + audit; resending re-triggers the delivery action with a
-- fresh row.

BEGIN;

CREATE TABLE IF NOT EXISTS public.talent_claim_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  talent_profile_id UUID NOT NULL REFERENCES public.talent_profiles(id) ON DELETE CASCADE,
  -- Snapshot of the destination at send time. Useful when the talent's
  -- contact row changes after the invite goes out.
  invited_email TEXT,
  invited_phone TEXT,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms')),
  sent_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Lifecycle markers
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivery_status TEXT NOT NULL DEFAULT 'queued'
    CHECK (delivery_status IN ('queued', 'sent', 'delivered', 'bounced', 'failed')),
  delivery_status_detail TEXT,
  -- When the talent signs up + their user_id gets linked, we mark redeemed.
  redeemed_at TIMESTAMPTZ,
  redeemed_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- When a new invite supersedes this one (resend), the older row stays
  -- in history but is marked revoked.
  revoked_at TIMESTAMPTZ,
  revoked_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Free-form note: e.g. "First send", "Resent — first one bounced".
  notes TEXT,
  -- 14-day default validity; the UI can show "Expires Mon Jun 3".
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '14 days')
);

CREATE INDEX IF NOT EXISTS idx_talent_claim_invitations_profile
  ON public.talent_claim_invitations (talent_profile_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_talent_claim_invitations_tenant_pending
  ON public.talent_claim_invitations (tenant_id, expires_at)
  WHERE redeemed_at IS NULL AND revoked_at IS NULL;

ALTER TABLE public.talent_claim_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS talent_claim_invitations_staff_all ON public.talent_claim_invitations;
CREATE POLICY talent_claim_invitations_staff_all ON public.talent_claim_invitations
  FOR ALL TO authenticated
  USING (public.is_staff_of_tenant(tenant_id))
  WITH CHECK (public.is_staff_of_tenant(tenant_id));

COMMENT ON TABLE public.talent_claim_invitations IS
  'F.2 — Audit log of claim invites sent to roster talents. Resending creates a new row + revokes pending older ones. Delivery itself happens via the Phase 8 email/SMS providers; rows reflect the intent + delivery state.';

COMMIT;
