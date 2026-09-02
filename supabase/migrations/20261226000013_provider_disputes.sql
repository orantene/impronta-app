-- Persist Stripe disputes, and make the evidence deadline visible.
--
-- FOUND BY: the Finance/Payments day-one audit (2026-09-01), P1-4.
--
-- Dispute HANDLING was already good: charge.dispute.created flags the
-- transaction without reversing (a dispute may be won, and clawing a talent
-- back before it resolves punishes them for something that might be reversed),
-- and charge.dispute.closed reverses on lost / restores on won.
--
-- What was missing is the RECORD. There was no disputes table at all, so:
--
--   • No evidence deadline was tracked anywhere. Stripe gives a fixed window to
--     submit evidence and a dispute is lost by default if it passes. Nothing in
--     Tulala knew the date existed, let alone alerted on it. That is money lost
--     to a calendar, not to a customer.
--   • A dispute on a NON-booking charge (a SaaS subscription, a client trust
--     top-up) produced a log line and nothing else.
--   • The balance impact was invisible: charge.dispute.funds_withdrawn and
--     .funds_reinstated were neither subscribed nor handled, so the money
--     leaving and returning left no trace.
--
-- Like provider_payouts, this table records what Stripe reports and derives
-- nothing. It is the provider side of a reconciliation.

CREATE TABLE IF NOT EXISTS public.provider_disputes (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  provider                TEXT NOT NULL DEFAULT 'stripe',
  stripe_dispute_id       TEXT NOT NULL,
  stripe_charge_id        TEXT,
  stripe_payment_intent_id TEXT,

  -- Business linkage, resolved where we can. All null is the honest answer for
  -- a dispute we cannot place (a subscription charge, say) — better than
  -- attaching it to the wrong booking.
  booking_transaction_id  UUID REFERENCES public.booking_transactions(id) ON DELETE SET NULL,
  booking_id              UUID,
  tenant_id               UUID REFERENCES public.agencies(id) ON DELETE SET NULL,

  amount_cents            BIGINT NOT NULL,
  currency                TEXT NOT NULL,

  -- Stripe's own values, stored verbatim rather than mapped.
  --   status: warning_needs_response | warning_under_review | warning_closed |
  --           needs_response | under_review | won | lost
  status                  TEXT NOT NULL,
  reason                  TEXT,

  -- THE FIELD THIS TABLE EXISTS FOR. Miss it and the dispute is lost by
  -- default, whatever the merits.
  evidence_due_by         TIMESTAMPTZ,
  evidence_submitted_at   TIMESTAMPTZ,

  -- Whether Stripe has taken the money back yet, and whether it came back.
  -- Driven by charge.dispute.funds_withdrawn / .funds_reinstated.
  funds_withdrawn_at      TIMESTAMPTZ,
  funds_reinstated_at     TIMESTAMPTZ,

  is_charge_refundable    BOOLEAN,

  opened_at               TIMESTAMPTZ,
  closed_at               TIMESTAMPTZ,

  last_event_id           TEXT,
  last_event_type         TEXT,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT provider_disputes_amount_nonneg CHECK (amount_cents >= 0),
  CONSTRAINT provider_disputes_currency_len  CHECK (char_length(currency) = 3)
);

COMMENT ON TABLE public.provider_disputes IS
  'Provider-side record of Stripe disputes. One row per stripe_dispute_id, upserted across the lifecycle. Exists primarily so evidence_due_by is tracked — a dispute is lost by default if that date passes. Stores what Stripe reports, not what we derive. Added by the 2026-09-01 finance audit (P1-4).';

CREATE UNIQUE INDEX IF NOT EXISTS provider_disputes_stripe_id_key
  ON public.provider_disputes (stripe_dispute_id);

-- The alerting read: "what is still open and when is it due?"
CREATE INDEX IF NOT EXISTS provider_disputes_open_due_idx
  ON public.provider_disputes (evidence_due_by ASC)
  WHERE closed_at IS NULL AND evidence_due_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS provider_disputes_tenant_idx
  ON public.provider_disputes (tenant_id, created_at DESC)
  WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS provider_disputes_txn_idx
  ON public.provider_disputes (booking_transaction_id)
  WHERE booking_transaction_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS. A dispute is the platform's liability (controller.losses.payments =
-- "application"), so platform admins see everything. Workspace staff see
-- disputes on their own bookings, because they own the customer relationship
-- and the evidence.
--
-- Talent deliberately CANNOT read these. A dispute is not their liability, they
-- cannot act on it, and surfacing "your client is disputing" before it resolves
-- would alarm them about money that is not being taken from them.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.provider_disputes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS provider_disputes_read_scoped ON public.provider_disputes;
CREATE POLICY provider_disputes_read_scoped
  ON public.provider_disputes
  FOR SELECT
  TO authenticated
  USING (
    public.is_platform_admin()
    OR (tenant_id IS NOT NULL AND public.is_staff_of_tenant(tenant_id))
  );

CREATE OR REPLACE FUNCTION public.provider_disputes_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS provider_disputes_touch ON public.provider_disputes;
CREATE TRIGGER provider_disputes_touch
  BEFORE UPDATE ON public.provider_disputes
  FOR EACH ROW EXECUTE FUNCTION public.provider_disputes_touch_updated_at();

-- Defence in depth. RLS already denies writes (there is no write policy), but
-- Supabase's default privileges attach EXPLICIT anon/authenticated grants to
-- every new table, so a REVOKE FROM PUBLIC alone leaves them in place. Both
-- halves are required — see migration 20261226000011.
REVOKE ALL ON FUNCTION public.provider_disputes_touch_updated_at() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.provider_disputes_touch_updated_at() FROM anon, authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.provider_disputes FROM PUBLIC, anon, authenticated;
REVOKE SELECT ON public.provider_disputes FROM anon;

DO $$
BEGIN
  IF has_table_privilege('anon', 'public.provider_disputes', 'SELECT')
     OR has_table_privilege('authenticated', 'public.provider_disputes', 'INSERT')
     OR has_table_privilege('authenticated', 'public.provider_disputes', 'UPDATE')
  THEN
    RAISE EXCEPTION 'provider_disputes: a revoke did not take — client roles still hold write or anon-read access';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.provider_disputes', 'INSERT') THEN
    RAISE EXCEPTION 'provider_disputes: service_role cannot write — the webhook would silently record nothing';
  END IF;
END $$;
