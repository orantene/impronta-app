-- Persist Stripe invoices, so there is an invoice register outside Stripe.
--
-- FOUND BY: the Finance/Payments day-one audit (2026-09-01), P1-5.
--
-- Invoices existed only as a TRIGGER. `invoice.payment_failed` and
-- `invoice.payment_succeeded` were used to re-sync a subscription's status and
-- then discarded; `invoice.paid`, `invoice.finalized`, `invoice.voided` and
-- `invoice.marked_uncollectible` were neither handled nor subscribed. Nothing
-- was ever written down.
--
-- The consequences:
--   • No invoice register. "Show me every invoice we issued last quarter, with
--     its number, total and tax" required opening the Stripe dashboard.
--   • No dunning history. `attempt_count` and `next_payment_attempt` are how you
--     see a subscription failing repeatedly before it churns.
--   • Credit notes were invisible. Stripe reports them on the invoice
--     (`pre_payment_credit_notes_amount` / `post_payment_credit_notes_amount`),
--     so an invoice-level adjustment left no trace on our side at all.
--
-- ── ON TAX: this table RECORDS tax, it does not CALCULATE it ─────────────────
-- Stripe Tax is not enabled on this account and no code anywhere calculates
-- tax, so `tax_cents` will be 0 on every row written today. The columns exist
-- because the day tax is switched on, the record must already be capturing it —
-- and because `automatic_tax_enabled` makes "were we collecting tax on this
-- invoice?" answerable per invoice rather than as a guess about a date range.
-- Issuing correct tax invoices is blocked on a tax adviser stating the rules
-- and on the seller-of-record decision; recording what Stripe already did is
-- not blocked by either, which is why this ships now.
--
-- Consistent with provider_payouts / provider_disputes /
-- provider_balance_transactions: store what Stripe reports, derive nothing.

CREATE TABLE IF NOT EXISTS public.provider_invoices (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  provider                    TEXT NOT NULL DEFAULT 'stripe',
  stripe_invoice_id           TEXT NOT NULL,
  -- Stripe's human-facing number (INV-0001). Null until finalized.
  invoice_number              TEXT,

  stripe_customer_id          TEXT,
  stripe_subscription_id      TEXT,

  -- Who it belongs to, resolved from subscription metadata where possible.
  -- Both null is the honest answer for an invoice we cannot place.
  tenant_id                   UUID REFERENCES public.agencies(id) ON DELETE SET NULL,
  talent_profile_id           UUID REFERENCES public.talent_profiles(id) ON DELETE SET NULL,

  -- draft | open | paid | uncollectible | void. Verbatim.
  status                      TEXT,
  -- charge_automatically | send_invoice.
  collection_method           TEXT,
  -- subscription_cycle | subscription_create | manual | ...
  billing_reason              TEXT,

  currency                    TEXT NOT NULL,
  subtotal_cents              BIGINT NOT NULL DEFAULT 0,
  -- Sum of Stripe's `total_taxes[].amount`. An ARRAY in this API version, not a
  -- scalar — checked against the SDK rather than assumed.
  tax_cents                   BIGINT NOT NULL DEFAULT 0,
  total_cents                 BIGINT NOT NULL DEFAULT 0,
  amount_paid_cents           BIGINT NOT NULL DEFAULT 0,
  amount_due_cents            BIGINT NOT NULL DEFAULT 0,
  amount_remaining_cents      BIGINT NOT NULL DEFAULT 0,

  -- Credit notes as Stripe reports them ON the invoice. Cheaper and less
  -- error-prone than a second table, and it is the number that actually
  -- reconciles against the invoice total.
  pre_payment_credit_notes_cents  BIGINT NOT NULL DEFAULT 0,
  post_payment_credit_notes_cents BIGINT NOT NULL DEFAULT 0,

  -- Was Stripe Tax active for this invoice? Makes the question answerable per
  -- invoice instead of by guessing at a switch-on date.
  automatic_tax_enabled       BOOLEAN NOT NULL DEFAULT FALSE,
  automatic_tax_status        TEXT,

  -- Dunning. The signal that a subscription is failing before it churns.
  attempt_count               INTEGER NOT NULL DEFAULT 0,
  next_payment_attempt        TIMESTAMPTZ,

  -- The billing period this invoice covers.
  period_start                TIMESTAMPTZ,
  period_end                  TIMESTAMPTZ,

  -- Lifecycle, from Stripe's status_transitions.
  stripe_created_at           TIMESTAMPTZ NOT NULL,
  finalized_at                TIMESTAMPTZ,
  paid_at                     TIMESTAMPTZ,
  voided_at                   TIMESTAMPTZ,
  marked_uncollectible_at     TIMESTAMPTZ,
  due_date                    TIMESTAMPTZ,

  -- The customer-facing artefacts. Worth storing so support can hand someone
  -- their invoice without a Stripe login.
  hosted_invoice_url          TEXT,
  invoice_pdf_url             TEXT,

  last_event_id               TEXT,
  last_event_type             TEXT,

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT provider_invoices_currency_len CHECK (char_length(currency) = 3)
);

COMMENT ON TABLE public.provider_invoices IS
  'Stripe invoices, upserted across their lifecycle. Gives an invoice register, dunning history and credit-note visibility outside the Stripe dashboard. RECORDS tax (Stripe Tax is currently off, so tax_cents is 0 on every row); does not calculate it. Added by the 2026-09-01 finance audit (P1-5).';

CREATE UNIQUE INDEX IF NOT EXISTS provider_invoices_stripe_id_key
  ON public.provider_invoices (stripe_invoice_id);

CREATE INDEX IF NOT EXISTS provider_invoices_tenant_idx
  ON public.provider_invoices (tenant_id, stripe_created_at DESC)
  WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS provider_invoices_talent_idx
  ON public.provider_invoices (talent_profile_id, stripe_created_at DESC)
  WHERE talent_profile_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS provider_invoices_subscription_idx
  ON public.provider_invoices (stripe_subscription_id, period_start DESC)
  WHERE stripe_subscription_id IS NOT NULL;

-- The dunning read: open invoices with a retry pending.
CREATE INDEX IF NOT EXISTS provider_invoices_dunning_idx
  ON public.provider_invoices (next_payment_attempt ASC)
  WHERE status = 'open' AND next_payment_attempt IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS. A customer's own invoices are theirs to see; everything else is the
-- platform's. Workspace staff see their workspace's invoices, a talent sees
-- their own, platform admins see all.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.provider_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS provider_invoices_read_own ON public.provider_invoices;
CREATE POLICY provider_invoices_read_own
  ON public.provider_invoices
  FOR SELECT
  TO authenticated
  USING (
    public.is_platform_admin()
    OR (tenant_id IS NOT NULL AND public.is_staff_of_tenant(tenant_id))
    OR (
      talent_profile_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.talent_profiles tp
        WHERE tp.id = provider_invoices.talent_profile_id
          AND tp.user_id = auth.uid()
      )
    )
  );

CREATE OR REPLACE FUNCTION public.provider_invoices_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS provider_invoices_touch ON public.provider_invoices;
CREATE TRIGGER provider_invoices_touch
  BEFORE UPDATE ON public.provider_invoices
  FOR EACH ROW EXECUTE FUNCTION public.provider_invoices_touch_updated_at();

-- Both revoke halves — Supabase's default privileges attach EXPLICIT
-- anon/authenticated grants, so a REVOKE FROM PUBLIC alone leaves them.
REVOKE ALL ON FUNCTION public.provider_invoices_touch_updated_at() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.provider_invoices_touch_updated_at() FROM anon, authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.provider_invoices FROM PUBLIC, anon, authenticated;
REVOKE SELECT ON public.provider_invoices FROM anon;

DO $$
BEGIN
  IF has_table_privilege('anon', 'public.provider_invoices', 'SELECT')
     OR has_table_privilege('authenticated', 'public.provider_invoices', 'INSERT')
     OR has_table_privilege('authenticated', 'public.provider_invoices', 'UPDATE')
  THEN
    RAISE EXCEPTION 'provider_invoices: a revoke did not take';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.provider_invoices', 'INSERT') THEN
    RAISE EXCEPTION 'provider_invoices: service_role cannot write — the webhook would silently record nothing';
  END IF;
END $$;
