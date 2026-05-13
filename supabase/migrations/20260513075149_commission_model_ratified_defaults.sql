-- Phase B foundation, follow-up — ratify the 5 commission decisions.
--
-- Locks in defaults from `web/docs/commission-model-2026-05-13.md` §11 +
-- this session's decision log (2026-05-13):
--
--   1. Platform default = 5 %  (ratified)
--   2. FLAT 5% across all plan tiers v1 — no tier discounts. Revisit at
--      Phase Z when we have real volume data per plan. (Deviation from
--      initial lean.)
--   3. Stripe Connect Standard (workspace as merchant)  (ratified)
--   4. Refunds reverse pro-rata across all 3 lanes  (ratified)
--   5. Per-tenant overrides — platform-admin only WRITE; workspaces
--      submit REQUESTS via the new columns added here. (ratified)
--
-- The platform_commission_config row was inserted at default values
-- by the prior migration. This migration:
--   (a) confirms those defaults via an idempotent UPDATE,
--   (b) adds request-tracking columns to workspace_commission_overrides
--       so workspaces can submit + Tulala admins can review.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Confirm the platform_commission_config seed.
-- ---------------------------------------------------------------------------
--
-- Idempotent — sets values to the ratified defaults regardless of prior state.
-- Plan-tier overrides intentionally LEFT EMPTY ({}) — flat 5% across tiers v1.

UPDATE public.platform_commission_config
   SET default_take_bps = 500,                -- 5.00%
       default_take_floor_cents = 0,
       plan_tier_bps = '{}'::jsonb,           -- empty = flat 5% for all plans
       cash_settlement_threshold_cents = 5000, -- $50 USD-equiv
       cash_settlement_currency = 'USD',
       updated_at = now()
 WHERE singleton_key = TRUE;

-- ---------------------------------------------------------------------------
-- 2. Add request-tracking columns to workspace_commission_overrides.
-- ---------------------------------------------------------------------------
--
-- Decision #5 — workspaces SUBMIT custom-rate requests, platform admin
-- approves/denies. Workspace can READ + WRITE the request fields on their
-- own row; only platform admin can write the actual rate fields.

ALTER TABLE public.workspace_commission_overrides
  ADD COLUMN IF NOT EXISTS requested_platform_take_bps INT
    CHECK (requested_platform_take_bps IS NULL OR (requested_platform_take_bps >= 0 AND requested_platform_take_bps <= 5000)),
  ADD COLUMN IF NOT EXISTS requested_note TEXT,
  ADD COLUMN IF NOT EXISTS requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS requested_by_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS request_status TEXT
    CHECK (request_status IS NULL OR request_status IN ('open', 'approved', 'denied', 'withdrawn')),
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS review_note TEXT;

COMMENT ON COLUMN public.workspace_commission_overrides.requested_platform_take_bps IS
  'What the workspace asked for. Platform admin reviews and either writes platform_take_bps (approve) or sets request_status=denied with a review_note.';

-- The prior write policy (platform_commission_overrides_write) gates ALL
-- writes to platform-admin. Loosen to allow tenant staff to write ONLY the
-- requested_* + request_status (when transitioning to 'open' or 'withdrawn').

DROP POLICY IF EXISTS workspace_commission_overrides_request_insert ON public.workspace_commission_overrides;
CREATE POLICY workspace_commission_overrides_request_insert ON public.workspace_commission_overrides
  FOR INSERT WITH CHECK (
    public.is_staff_of_tenant(tenant_id)
    -- Workspace insert MUST be a request — they can't write the actual rate fields.
    AND platform_take_bps IS NULL
    AND platform_take_floor_cents IS NULL
    AND default_workspace_take_bps IS NULL
    AND default_workspace_take_per_unit_cents IS NULL
    AND requested_platform_take_bps IS NOT NULL
    AND (request_status IS NULL OR request_status = 'open')
  );

DROP POLICY IF EXISTS workspace_commission_overrides_request_update ON public.workspace_commission_overrides;
CREATE POLICY workspace_commission_overrides_request_update ON public.workspace_commission_overrides
  FOR UPDATE USING (
    public.is_staff_of_tenant(tenant_id)
    AND request_status = 'open'
  ) WITH CHECK (
    public.is_staff_of_tenant(tenant_id)
    -- Workspace can only update the request fields or withdraw it.
    AND (request_status IS NULL OR request_status IN ('open', 'withdrawn'))
  );

-- Index for the platform admin's "open requests" queue UI.
CREATE INDEX IF NOT EXISTS workspace_commission_overrides_open_requests_idx
  ON public.workspace_commission_overrides (requested_at DESC)
  WHERE request_status = 'open';

COMMIT;
