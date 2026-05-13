-- F.8 — Talent profile change request queue.
--
-- On Agency-tier workspaces, talent self-edits don't go live immediately
-- — they land in a review queue keyed by talent_profile_change_requests.
-- Agency admin reviews and approves / rejects (bulk accept / bulk reject
-- both supported via the action layer).
--
-- Each row holds a JSONB diff (proposed values for changed fields) so
-- the agency can preview before applying.
--
-- After acceptance, the apply step writes the values back to
-- talent_profiles (engine-side action; this migration only covers
-- the queue).
--
-- Free / Studio tiers don't use this queue — talent edits go live
-- directly. The gating is per-tenant via agency_entitlements
-- (`require_profile_change_review` boolean we add below).

BEGIN;

ALTER TABLE public.agency_entitlements
  ADD COLUMN IF NOT EXISTS require_profile_change_review BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.agency_entitlements.require_profile_change_review IS
  'F.8 — When true, talent self-edits land in talent_profile_change_requests instead of writing live. Agency must approve. Default false; enabled per-tenant on Agency tier.';

CREATE TABLE IF NOT EXISTS public.talent_profile_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  talent_profile_id UUID NOT NULL REFERENCES public.talent_profiles(id) ON DELETE CASCADE,
  submitted_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- The proposed changes — a flat object of column → new_value.
  -- Example: { "short_bio": "...", "height_cm": 178, "display_name": "Sofía M." }
  changes JSONB NOT NULL,
  -- For diff preview: snapshot of the prior values for the same keys.
  previous_values JSONB,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'rejected', 'superseded')),
  decided_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  decision_note TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profile_change_requests_pending
  ON public.talent_profile_change_requests (tenant_id, submitted_at DESC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_profile_change_requests_profile
  ON public.talent_profile_change_requests (talent_profile_id, submitted_at DESC);

ALTER TABLE public.talent_profile_change_requests ENABLE ROW LEVEL SECURITY;

-- Staff of tenant can read + decide on their own tenant's requests.
DROP POLICY IF EXISTS profile_change_requests_staff_all ON public.talent_profile_change_requests;
CREATE POLICY profile_change_requests_staff_all ON public.talent_profile_change_requests
  FOR ALL TO authenticated
  USING (public.is_staff_of_tenant(tenant_id))
  WITH CHECK (public.is_staff_of_tenant(tenant_id));

-- Talent can read their own pending requests (so they see "waiting for
-- agency review" state).
DROP POLICY IF EXISTS profile_change_requests_talent_self_select ON public.talent_profile_change_requests;
CREATE POLICY profile_change_requests_talent_self_select ON public.talent_profile_change_requests
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.talent_profiles tp
      WHERE tp.id = talent_profile_id AND tp.user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.talent_profile_change_requests IS
  'F.8 — Talent self-edit changes pending agency approval. Gated per-tenant via agency_entitlements.require_profile_change_review. Bulk accept / bulk reject via review action layer.';

COMMIT;
