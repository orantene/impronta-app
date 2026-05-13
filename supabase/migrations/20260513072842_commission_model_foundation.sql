-- Phase B foundation — commission & take-rate data model.
--
-- Five tables establish the platform-take / workspace-take / talent-net
-- split + balance ledger for off-platform (cash/wire) payments.
--
-- Full spec: web/docs/commission-model-2026-05-13.md
--
-- NO engine wiring in this migration — pure schema. The
-- `convertInquiryToBooking` engine call gets the snapshot-persist
-- branch in Phase B PR 2 (next marathon, requires Stripe ops).

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. platform_commission_config — singleton, Tulala-owned.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.platform_commission_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Default platform take, in basis points (500 = 5.00%).
  default_take_bps INT NOT NULL DEFAULT 500
    CHECK (default_take_bps >= 0 AND default_take_bps <= 5000),  -- cap at 50%

  -- Optional floor in cents — platform fee is max(% take, floor).
  default_take_floor_cents INT NOT NULL DEFAULT 0
    CHECK (default_take_floor_cents >= 0),

  -- Plan-tier overrides. JSON: {"studio": 500, "agency": 350, "network": 250}.
  -- Empty {} = use default_take_bps for every plan.
  plan_tier_bps JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Off-platform balance settlement threshold (cents in cash_settlement_currency).
  -- Balance must exceed this before auto-invoicing.
  cash_settlement_threshold_cents INT NOT NULL DEFAULT 5000
    CHECK (cash_settlement_threshold_cents >= 0),
  cash_settlement_currency TEXT NOT NULL DEFAULT 'USD'
    CHECK (length(cash_settlement_currency) = 3),

  -- Enforce singleton.
  singleton_key BOOLEAN NOT NULL DEFAULT TRUE UNIQUE CHECK (singleton_key = TRUE),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.platform_commission_config IS
  'Singleton row. Tulala-owned. Holds the platform-wide commission defaults + plan-tier overrides + off-platform settlement policy.';

-- Seed the singleton (5% default, no plan tiers configured, $50 USD threshold).
-- ON CONFLICT silently no-ops on re-run — we never want two rows.
INSERT INTO public.platform_commission_config (default_take_bps, default_take_floor_cents, plan_tier_bps)
VALUES (500, 0, '{}'::jsonb)
ON CONFLICT (singleton_key) DO NOTHING;

ALTER TABLE public.platform_commission_config ENABLE ROW LEVEL SECURITY;

-- Read: only platform admins. Workspaces read THEIR resolved rate via a
-- SECURITY DEFINER RPC (next migration / Phase B PR 2 — not here).
DROP POLICY IF EXISTS platform_commission_config_read ON public.platform_commission_config;
CREATE POLICY platform_commission_config_read ON public.platform_commission_config
  FOR SELECT USING (public.is_platform_admin());

DROP POLICY IF EXISTS platform_commission_config_write ON public.platform_commission_config;
CREATE POLICY platform_commission_config_write ON public.platform_commission_config
  FOR UPDATE USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- 2. workspace_commission_overrides — per-tenant negotiated rates.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.workspace_commission_overrides (
  tenant_id UUID PRIMARY KEY REFERENCES public.agencies(id) ON DELETE CASCADE,

  -- Platform-take override (NULL = use plan-tier or platform default).
  platform_take_bps INT
    CHECK (platform_take_bps IS NULL OR (platform_take_bps >= 0 AND platform_take_bps <= 5000)),
  platform_take_floor_cents INT
    CHECK (platform_take_floor_cents IS NULL OR platform_take_floor_cents >= 0),

  -- Workspace's OWN default commission (their cut). These are UI hints
  -- for the offer drafter — the runtime workspace-take is computed from
  -- line items (unit_price - talent_cost). See §6 of the spec for why.
  default_workspace_take_bps INT
    CHECK (default_workspace_take_bps IS NULL OR (default_workspace_take_bps >= 0 AND default_workspace_take_bps <= 9000)),
  default_workspace_take_per_unit_cents INT
    CHECK (default_workspace_take_per_unit_cents IS NULL OR default_workspace_take_per_unit_cents >= 0),
  default_workspace_take_per_unit_label TEXT,  -- "hour" / "day" / "event"

  -- Audit trail.
  override_note TEXT NOT NULL DEFAULT '',
  set_by_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  set_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.workspace_commission_overrides IS
  'Per-tenant overrides on commission rates. WRITE access is platform-admin only — workspaces request changes via a flow, Tulala approves and writes.';

ALTER TABLE public.workspace_commission_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspace_commission_overrides_read ON public.workspace_commission_overrides;
CREATE POLICY workspace_commission_overrides_read ON public.workspace_commission_overrides
  FOR SELECT USING (
    public.is_platform_admin()
    OR public.is_staff_of_tenant(tenant_id)
  );

DROP POLICY IF EXISTS workspace_commission_overrides_write ON public.workspace_commission_overrides;
CREATE POLICY workspace_commission_overrides_write ON public.workspace_commission_overrides
  FOR ALL USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- 3. booking_commission_snapshot — immutable per-booking record.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.booking_commission_snapshot (
  booking_id UUID PRIMARY KEY REFERENCES public.agency_bookings(id) ON DELETE CASCADE,

  -- Rates that were in effect at the moment of offer-acceptance.
  platform_take_bps INT NOT NULL CHECK (platform_take_bps >= 0 AND platform_take_bps <= 5000),
  platform_take_floor_cents INT NOT NULL DEFAULT 0 CHECK (platform_take_floor_cents >= 0),

  -- Amounts (cents, presentment currency). Cents > 0 enforced; signs make no sense here.
  gross_cents INT NOT NULL CHECK (gross_cents >= 0),
  platform_fee_cents INT NOT NULL CHECK (platform_fee_cents >= 0),
  workspace_fee_cents INT NOT NULL CHECK (workspace_fee_cents >= 0),
  talent_net_cents INT NOT NULL CHECK (talent_net_cents >= 0),
  currency_code TEXT NOT NULL CHECK (length(currency_code) = 3),

  -- Payment method.
  payment_method TEXT NOT NULL CHECK (payment_method IN (
    'card', 'apple_pay', 'google_pay', 'bank_transfer',
    'cash', 'wire', 'venue_paid', 'crypto', 'other'
  )),
  off_platform_reason TEXT,

  -- Audit — which level of the override hierarchy supplied the platform rate?
  resolved_from TEXT NOT NULL CHECK (resolved_from IN (
    'platform_default', 'plan_tier', 'tenant_override', 'booking_override'
  )),

  -- The snapshot is IMMUTABLE — no updated_at. Snapshots stand as record of
  -- the moment of acceptance.
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Math sanity: lanes must sum to gross.
  CONSTRAINT lanes_sum_to_gross
    CHECK (platform_fee_cents + workspace_fee_cents + talent_net_cents = gross_cents)
);

COMMENT ON TABLE public.booking_commission_snapshot IS
  'Immutable per-booking record of how the three lanes split. Persisted by convertInquiryToBooking at acceptance time. Source of truth for downstream reporting / payouts / settlement.';

CREATE INDEX IF NOT EXISTS booking_commission_snapshot_created_at_idx
  ON public.booking_commission_snapshot (created_at DESC);

ALTER TABLE public.booking_commission_snapshot ENABLE ROW LEVEL SECURITY;

-- Read: platform admin OR staff-of-tenant whose booking this is. We resolve
-- tenant by joining through agency_bookings. The talent on the booking
-- ALSO needs to see their breakdown — added separately by joining inquiry_participants.
-- For v1 we keep it simple: platform admin + workspace staff. Talent-facing
-- reads go through a SECURITY DEFINER RPC.
DROP POLICY IF EXISTS booking_commission_snapshot_read ON public.booking_commission_snapshot;
CREATE POLICY booking_commission_snapshot_read ON public.booking_commission_snapshot
  FOR SELECT USING (
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.agency_bookings b
      WHERE b.id = booking_commission_snapshot.booking_id
        AND public.is_staff_of_tenant(b.tenant_id)
    )
  );

-- Write: engine path only (SECURITY DEFINER RPC inserts; no direct writes
-- from any user). Block all direct INSERT/UPDATE/DELETE via no write policy.
-- Immutability is enforced both by lack of policy AND by leaving no UPDATE
-- policy in place.

-- ---------------------------------------------------------------------------
-- 4. platform_commission_balances — per-tenant balance ledger.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.platform_commission_balances (
  tenant_id UUID PRIMARY KEY REFERENCES public.agencies(id) ON DELETE CASCADE,

  -- Currency-keyed balances. {"MXN": 4500, "USD": 1200} = 45 MXN + 12 USD owed.
  -- Positive = workspace owes platform. Negative theoretically possible but
  -- normalized to 0 by the settlement job.
  balances_cents JSONB NOT NULL DEFAULT '{}'::jsonb,

  last_settled_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.platform_commission_balances IS
  'Per-tenant balance the workspace owes the platform for off-platform (cash/wire) bookings. Currency-keyed. Settled via Stripe Invoice when threshold reached.';

ALTER TABLE public.platform_commission_balances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_commission_balances_read ON public.platform_commission_balances;
CREATE POLICY platform_commission_balances_read ON public.platform_commission_balances
  FOR SELECT USING (
    public.is_platform_admin()
    OR public.is_staff_of_tenant(tenant_id)
  );

-- Write: engine path only. No policy = no user writes.

-- ---------------------------------------------------------------------------
-- 5. platform_commission_movements — full audit log.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.platform_commission_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES public.agency_bookings(id) ON DELETE SET NULL,

  movement_type TEXT NOT NULL CHECK (movement_type IN (
    'accrual',                -- booking creates platform-fee debt (off-platform)
    'card_settlement_auto',   -- in-platform card payment, platform fee captured by Stripe
    'invoice_settlement',     -- Stripe invoice paid by workspace
    'adjustment_credit',      -- manual platform-admin write-down
    'adjustment_debit',       -- manual platform-admin write-up
    'refund_reversal'         -- booking refund reverses prior accrual
  )),

  -- Positive = workspace owes more (debit). Negative = paid down / credited.
  amount_cents INT NOT NULL,
  currency_code TEXT NOT NULL CHECK (length(currency_code) = 3),
  note TEXT,

  -- Settlement-related references.
  stripe_invoice_id TEXT,
  stripe_payment_intent_id TEXT,

  created_by_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.platform_commission_movements IS
  'Movement log — every accrual + settlement event for the off-platform balance ledger. Append-only. Drives platform_commission_balances by aggregation.';

CREATE INDEX IF NOT EXISTS platform_commission_movements_tenant_idx
  ON public.platform_commission_movements (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS platform_commission_movements_booking_idx
  ON public.platform_commission_movements (booking_id) WHERE booking_id IS NOT NULL;

ALTER TABLE public.platform_commission_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_commission_movements_read ON public.platform_commission_movements;
CREATE POLICY platform_commission_movements_read ON public.platform_commission_movements
  FOR SELECT USING (
    public.is_platform_admin()
    OR public.is_staff_of_tenant(tenant_id)
  );

-- Write: engine path only.

COMMIT;
