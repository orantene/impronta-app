-- Phase 8.3 — Client trust economics: verification fee + funded-account balance.
--
-- The client_trust_state table already exists (Phase 3.7 migration).
-- This migration adds the payment infrastructure on top:
--
--   client_stripe_customers  — maps client user_id → Stripe Customer ID.
--   client_balance_ledger    — append-only log of deposits (+ future debits/refunds).
--
-- Verification: a $5 one-time Stripe Checkout payment sets verified_at on
-- client_trust_state, which the trust evaluator uses to promote basic → verified.
--
-- Balance top-ups: on-demand Stripe Checkout payments (variable amount) append a
-- row to client_balance_ledger and increment funded_balance_cents on
-- client_trust_state, which the evaluator uses to promote verified → silver/gold.
--
-- Trust evaluation is code-driven (lib/client-trust/evaluator.ts), not SQL.
-- Thresholds: Silver = $100 funded (10,000 cents), Gold = $500 funded (50,000 cents).

BEGIN;

-- ─── client_stripe_customers ──────────────────────────────────────────────────
-- One row per client user — independent from workspace and talent billing.

CREATE TABLE IF NOT EXISTS public.client_stripe_customers (
  user_id             UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id  TEXT        NOT NULL UNIQUE,
  billing_email       TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.client_stripe_customers IS
  'Maps client user_id to their Stripe Customer object for verification and balance top-up payments. One row per user — independent from workspace or talent billing.';

ALTER TABLE public.client_stripe_customers ENABLE ROW LEVEL SECURITY;

-- Clients can read their own row.
DROP POLICY IF EXISTS client_stripe_customers_self_read ON public.client_stripe_customers;
CREATE POLICY client_stripe_customers_self_read ON public.client_stripe_customers
  FOR SELECT
  USING (user_id = auth.uid());

-- ─── client_balance_ledger ────────────────────────────────────────────────────
-- Append-only log of client balance events. The current balance is authoritative
-- on client_trust_state.funded_balance_cents; this table provides an audit trail.

CREATE TABLE IF NOT EXISTS public.client_balance_ledger (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id               UUID        NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  -- Positive = deposit; negative = debit/refund.
  amount_cents            BIGINT      NOT NULL,
  -- 'deposit' for top-ups, 'refund' for refunds, 'debit' for future booking charges.
  entry_type              TEXT        NOT NULL DEFAULT 'deposit'
                            CHECK (entry_type IN ('deposit', 'refund', 'debit')),
  stripe_payment_intent_id TEXT,
  note                    TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.client_balance_ledger IS
  'Append-only audit log of client balance events (deposits, refunds, debits). The authoritative current balance is funded_balance_cents on client_trust_state.';

ALTER TABLE public.client_balance_ledger ENABLE ROW LEVEL SECURITY;

-- Clients can read their own ledger rows.
DROP POLICY IF EXISTS client_balance_ledger_self_read ON public.client_balance_ledger;
CREATE POLICY client_balance_ledger_self_read ON public.client_balance_ledger
  FOR SELECT
  USING (user_id = auth.uid());

-- Agency staff can read ledger rows for clients in their tenant.
DROP POLICY IF EXISTS client_balance_ledger_staff_read ON public.client_balance_ledger;
CREATE POLICY client_balance_ledger_staff_read ON public.client_balance_ledger
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.agency_memberships WHERE user_id = auth.uid()
    )
  );

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_client_balance_ledger_user_id
  ON public.client_balance_ledger (user_id);

CREATE INDEX IF NOT EXISTS idx_client_balance_ledger_tenant_id
  ON public.client_balance_ledger (tenant_id);

CREATE INDEX IF NOT EXISTS idx_client_balance_ledger_payment_intent
  ON public.client_balance_ledger (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

-- ─── Updated-at trigger on client_stripe_customers ───────────────────────────
-- Reuses billing_touch_updated_at() from Phase 8.1 migration.

DROP TRIGGER IF EXISTS trg_client_stripe_customers_updated_at ON public.client_stripe_customers;
CREATE TRIGGER trg_client_stripe_customers_updated_at
  BEFORE UPDATE ON public.client_stripe_customers
  FOR EACH ROW EXECUTE FUNCTION public.billing_touch_updated_at();

COMMIT;
