-- Ingest Stripe balance transactions — the only place fees and FX are knowable.
--
-- FOUND BY: the Finance/Payments day-one audit (2026-09-01), P1-11 / P2-2.
--
-- Nothing in the codebase reads a Stripe balance transaction. That single gap
-- is why several questions a finance function must answer are currently
-- unanswerable without opening the Stripe dashboard by hand:
--
--   • WHAT DID STRIPE ACTUALLY CHARGE US? The commission engine computes the
--     platform's take precisely, but the PROCESSING fee is never recorded
--     anywhere. Gross-to-net is therefore not derivable from our own data, and
--     "platform revenue" as reported today is really "platform take", which is
--     a different and larger number.
--   • WHAT FX RATE WAS APPLIED? Both connected accounts are Mexican with an MXN
--     default currency, while the platform charges and transfers in USD. Stripe
--     converts on the way out, and the rate it used is recorded only on the
--     balance transaction. Without it, a talent's `talent_net_cents` is a USD
--     figure whose landed MXN value we cannot state.
--   • WHAT MADE UP THIS PAYOUT? A payout is the sum of the balance transactions
--     it settled. Without them a bank deposit cannot be decomposed, which is
--     the core of reconciliation.
--
-- WHY A CRON AND NOT A WEBHOOK: balance transactions have no reliable event of
-- their own — they are created as a side effect of charges, refunds, transfers,
-- payouts and adjustments. Stripe's own guidance for building a ledger is to
-- PAGE THE LIST endpoint. Paging is also self-healing: a missed window is fixed
-- by the next run widening its lookback, whereas a missed webhook is gone.
--
-- Like provider_payouts and provider_disputes, this stores what Stripe reports
-- and derives nothing. It is the provider side of a reconciliation, and
-- reconciliation is only worth running if the two sides can disagree.

CREATE TABLE IF NOT EXISTS public.provider_balance_transactions (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  provider                  TEXT NOT NULL DEFAULT 'stripe',
  stripe_balance_txn_id     TEXT NOT NULL,

  -- NULL = the platform account. Non-null = a connected account's own ledger.
  stripe_account_id         TEXT,

  -- What produced it: charge | refund | transfer | payout | adjustment |
  -- stripe_fee | application_fee | payment | contribution | ... Stored verbatim;
  -- Stripe adds types and a coerced value would silently mis-file money.
  type                      TEXT NOT NULL,
  -- Stripe's coarser grouping, which is what its own reports roll up by.
  reporting_category        TEXT,

  -- The object this settles (ch_…, re_…, tr_…, po_…). The join key to our
  -- other provider tables and, through them, to a booking.
  source_id                 TEXT,

  -- THE THREE NUMBERS. gross, what Stripe took, what remained.
  -- net = amount - fee, always, in the SETTLEMENT currency.
  amount_cents              BIGINT NOT NULL,
  fee_cents                 BIGINT NOT NULL DEFAULT 0,
  net_cents                 BIGINT NOT NULL,
  currency                  TEXT NOT NULL,

  -- FX. Present only when Stripe converted. `exchange_rate` is the rate applied
  -- to reach the settlement currency; the presented pair is what the customer
  -- or recipient actually saw.
  exchange_rate             NUMERIC,
  presented_amount_cents    BIGINT,
  presented_currency        TEXT,

  -- The fee, itemised. Stripe returns a breakdown (stripe fee, application fee,
  -- tax on the fee) and the parts matter for accounting: an application fee is
  -- our own revenue coming back, not a cost.
  fee_details               JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- When Stripe created it, and when the money becomes withdrawable. The second
  -- is what makes a balance forecast possible.
  stripe_created_at         TIMESTAMPTZ NOT NULL,
  available_on              TIMESTAMPTZ,

  -- Business linkage, resolved where we can, null rather than guessed when not.
  booking_transaction_id    UUID REFERENCES public.booking_transactions(id) ON DELETE SET NULL,
  tenant_id                 UUID REFERENCES public.agencies(id) ON DELETE SET NULL,

  ingested_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT pbt_currency_len CHECK (char_length(currency) = 3),
  -- net = amount - fee is Stripe's own invariant. If it ever fails, we have
  -- misread the payload and should find out loudly rather than store nonsense.
  CONSTRAINT pbt_net_is_amount_minus_fee CHECK (net_cents = amount_cents - fee_cents)
);

COMMENT ON TABLE public.provider_balance_transactions IS
  'Stripe balance transactions, paged in by cron (they have no reliable webhook). The only source of processing fees and applied FX rates, and the raw material for decomposing a payout into what it settled. Stores what Stripe reports, derives nothing. Added by the 2026-09-01 finance audit (P1-11 / P2-2).';

CREATE UNIQUE INDEX IF NOT EXISTS pbt_stripe_id_key
  ON public.provider_balance_transactions (stripe_balance_txn_id);

-- Reconciliation reads: "what settled in this window", and "what made up this
-- charge / payout".
CREATE INDEX IF NOT EXISTS pbt_created_idx
  ON public.provider_balance_transactions (stripe_created_at DESC);

CREATE INDEX IF NOT EXISTS pbt_source_idx
  ON public.provider_balance_transactions (source_id)
  WHERE source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS pbt_type_created_idx
  ON public.provider_balance_transactions (type, stripe_created_at DESC);

CREATE INDEX IF NOT EXISTS pbt_tenant_idx
  ON public.provider_balance_transactions (tenant_id, stripe_created_at DESC)
  WHERE tenant_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS. Platform-admin read only.
--
-- This is the platform's OWN cost and FX data. A workspace seeing the Stripe fee
-- on its bookings would be reading Tulala's margin structure, which is not
-- theirs to see. Per-workspace financial reporting is served by the commission
-- snapshot, which is already scoped to them.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.provider_balance_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pbt_read_platform_admin ON public.provider_balance_transactions;
CREATE POLICY pbt_read_platform_admin
  ON public.provider_balance_transactions
  FOR SELECT
  TO authenticated
  USING (public.is_platform_admin());

CREATE OR REPLACE FUNCTION public.pbt_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pbt_touch ON public.provider_balance_transactions;
CREATE TRIGGER pbt_touch
  BEFORE UPDATE ON public.provider_balance_transactions
  FOR EACH ROW EXECUTE FUNCTION public.pbt_touch_updated_at();

-- Defence in depth. Supabase's default privileges attach EXPLICIT
-- anon/authenticated grants to every new table, so a REVOKE FROM PUBLIC alone
-- leaves them in place. Both halves are required — see 20261226000011.
REVOKE ALL ON FUNCTION public.pbt_touch_updated_at() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pbt_touch_updated_at() FROM anon, authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.provider_balance_transactions FROM PUBLIC, anon, authenticated;
REVOKE SELECT ON public.provider_balance_transactions FROM anon;

DO $$
BEGIN
  IF has_table_privilege('anon', 'public.provider_balance_transactions', 'SELECT')
     OR has_table_privilege('authenticated', 'public.provider_balance_transactions', 'INSERT')
     OR has_table_privilege('authenticated', 'public.provider_balance_transactions', 'UPDATE')
  THEN
    RAISE EXCEPTION 'provider_balance_transactions: a revoke did not take';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.provider_balance_transactions', 'INSERT') THEN
    RAISE EXCEPTION 'provider_balance_transactions: service_role cannot write — the ingest would silently record nothing';
  END IF;
END $$;
