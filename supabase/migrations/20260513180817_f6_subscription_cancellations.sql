-- F.6 — Self-service subscription cancellations + feedback survey.
--
-- Records the cancellation event with the reason the user gave us, so
-- product can track churn drivers. Decoupled from agency_entitlements
-- and the Stripe webhook layer — this is a UX-only audit log; the
-- downgrade itself happens via changeWorkspacePlan / Stripe.

BEGIN;

CREATE TABLE IF NOT EXISTS public.subscription_cancellations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  cancelled_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Plan transition: e.g. ('agency' → 'free') for a full cancel, or
  -- ('agency' → 'studio') for a downgrade.
  from_plan TEXT NOT NULL,
  to_plan TEXT NOT NULL,
  -- Categorical reason — drives churn analytics. Free-text in `feedback`.
  reason TEXT NOT NULL
    CHECK (reason IN (
      'too_expensive',
      'not_using',
      'missing_feature',
      'found_alternative',
      'paused_business',
      'technical_issue',
      'other'
    )),
  feedback TEXT,
  -- When the change takes effect (immediate for free, end-of-period for paid).
  effective_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscription_cancellations_tenant
  ON public.subscription_cancellations (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_subscription_cancellations_reason
  ON public.subscription_cancellations (reason, created_at DESC);

ALTER TABLE public.subscription_cancellations ENABLE ROW LEVEL SECURITY;

-- Tenant staff can read their own tenant's cancellation history.
DROP POLICY IF EXISTS subscription_cancellations_staff_select ON public.subscription_cancellations;
CREATE POLICY subscription_cancellations_staff_select ON public.subscription_cancellations
  FOR SELECT TO authenticated
  USING (public.is_staff_of_tenant(tenant_id));

-- Inserts come from the server action via service role; no public INSERT policy.

COMMENT ON TABLE public.subscription_cancellations IS
  'F.6 — Audit log of self-service plan cancellations / downgrades + categorical churn reason + optional free-text feedback. Decoupled from billing — the plan change itself happens via changeWorkspacePlan / Stripe webhook.';

COMMIT;
