-- The financial ledger: chart of accounts + balanced double-entry movements.
--
-- FOUND BY: the Finance/Payments day-one audit (2026-09-01). This is the
-- single largest gap in the report, and the reason readiness sits at 5 rather
-- than 9: there is no place where a number can be traced from origin to
-- destination.
--
-- ── Why double entry, and not a simpler signed-amount log ───────────────────
-- Tulala holds money that is NOT its own. A booking charge arrives on the
-- platform account and at that instant most of it is a LIABILITY: owed to the
-- talent, owed to the workspace. Only the platform fee is revenue, and even
-- that is gross of Stripe's cut.
--
-- A single-entry log of "movements" can record that money arrived. It cannot
-- answer "how much of the balance is ours?" without someone re-deriving the
-- split, and re-derivation is exactly what drifts. Double entry answers it by
-- construction: every event writes BOTH sides, the group sums to zero, and the
-- liability accounts carry what is owed. "Money received is not automatically
-- revenue" stops being a rule people must remember and becomes a property of
-- the schema.
--
-- The invariant is enforced in the database, not in application code, by a
-- deferred constraint trigger: a transaction that leaves any group unbalanced
-- cannot commit. Balance is not something a future writer can forget.
--
-- ── What this migration does and does not do ────────────────────────────────
-- DOES: the chart of accounts, the entry table, the balance invariant, and a
-- seeded chart reflecting how money actually moves here.
-- DOES NOT: project anything into it yet. The projection from booking payments
-- and subscriptions follows, so that the model can be reviewed on its own
-- before anything depends on it. An empty ledger is honest; a half-projected
-- one is worse than none.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Chart of accounts
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ledger_account_kind') THEN
    CREATE TYPE public.ledger_account_kind AS ENUM (
      'asset',      -- cash and money held at a provider
      'liability',  -- money we hold that belongs to someone else
      'revenue',    -- ours, earned
      'expense',    -- ours, spent (processing fees)
      'contra'      -- reductions of the above (refunds, reversals)
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.ledger_accounts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Stable machine key. Referenced by the projection code, so it must never be
  -- renamed once entries point at it.
  code          TEXT NOT NULL,
  name          TEXT NOT NULL,
  kind          public.ledger_account_kind NOT NULL,
  description   TEXT,

  -- Which direction increases this account. Assets and expenses increase on
  -- the debit side; liabilities and revenue on the credit side. Stored rather
  -- than inferred from `kind` so a contra account can state its own polarity.
  normal_side   TEXT NOT NULL CHECK (normal_side IN ('debit', 'credit')),

  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ledger_accounts IS
  'Chart of accounts for the financial ledger. `code` is the stable machine key referenced by projection code and must not be renamed. Added by the 2026-09-01 finance audit.';

CREATE UNIQUE INDEX IF NOT EXISTS ledger_accounts_code_key ON public.ledger_accounts (code);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Entries
--
-- One row per LEG. A booking payment writes several: the cash that arrived, the
-- liability to the talent, the liability to the workspace, the platform's
-- revenue, the processor's fee. They share a `group_id` and sum to zero.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ledger_entries (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Legs of one economic event. The balance invariant applies per (group, currency).
  group_id            UUID NOT NULL,
  -- What kind of event produced this group: booking_payment, refund,
  -- subscription_invoice, payout, dispute, adjustment...
  group_kind          TEXT NOT NULL,

  account_id          UUID NOT NULL REFERENCES public.ledger_accounts(id) ON DELETE RESTRICT,

  -- SIGNED minor units. Positive = debit, negative = credit. One signed column
  -- rather than two nullable ones, so "does this balance?" is a SUM and cannot
  -- be fooled by a leg that fills in both or neither.
  amount_cents        BIGINT NOT NULL,
  currency            TEXT NOT NULL,

  -- WHO this leg concerns. A liability leg without a counterparty is a number
  -- nobody can be paid.
  tenant_id           UUID REFERENCES public.agencies(id) ON DELETE SET NULL,
  talent_profile_id   UUID REFERENCES public.talent_profiles(id) ON DELETE SET NULL,

  -- WHAT it relates to, on our side.
  booking_id          UUID,
  booking_transaction_id UUID REFERENCES public.booking_transactions(id) ON DELETE SET NULL,

  -- WHAT it relates to, at the provider. This is the join that makes
  -- reconciliation possible at all.
  provider            TEXT NOT NULL DEFAULT 'stripe',
  provider_object_id  TEXT,

  -- When the money moved, which is NOT when we wrote the row. Reporting periods
  -- are cut on this.
  occurred_at         TIMESTAMPTZ NOT NULL,
  recorded_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Free-text explanation for a human reading a statement line.
  memo                TEXT,

  CONSTRAINT ledger_entries_currency_len CHECK (char_length(currency) = 3),
  -- A zero-amount leg carries no information and would let an "empty" group
  -- pass the balance check while recording nothing.
  CONSTRAINT ledger_entries_nonzero CHECK (amount_cents <> 0)
);

COMMENT ON TABLE public.ledger_entries IS
  'Append-only double-entry ledger. One row per leg; legs sharing a group_id must sum to zero per currency, enforced by a deferred constraint trigger. amount_cents is SIGNED: positive = debit, negative = credit. Added by the 2026-09-01 finance audit.';

CREATE INDEX IF NOT EXISTS ledger_entries_group_idx ON public.ledger_entries (group_id);
CREATE INDEX IF NOT EXISTS ledger_entries_account_time_idx ON public.ledger_entries (account_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS ledger_entries_tenant_idx ON public.ledger_entries (tenant_id, occurred_at DESC) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ledger_entries_talent_idx ON public.ledger_entries (talent_profile_id, occurred_at DESC) WHERE talent_profile_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ledger_entries_provider_obj_idx ON public.ledger_entries (provider_object_id) WHERE provider_object_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ledger_entries_txn_idx ON public.ledger_entries (booking_transaction_id) WHERE booking_transaction_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. The invariant, enforced by the database
--
-- DEFERRED so a projection can insert its legs one at a time inside a
-- transaction; the check runs once at COMMIT. An unbalanced group cannot be
-- committed, so "the books balance" is a property of the schema rather than a
-- discipline the next writer has to remember.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ledger_assert_group_balanced()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_currency TEXT;
  v_sum      BIGINT;
BEGIN
  -- Per currency: a group may legitimately span currencies (an FX movement),
  -- and each side must balance on its own.
  FOR v_currency, v_sum IN
    SELECT currency, SUM(amount_cents)
    FROM public.ledger_entries
    WHERE group_id = COALESCE(NEW.group_id, OLD.group_id)
    GROUP BY currency
  LOOP
    IF v_sum <> 0 THEN
      RAISE EXCEPTION
        'ledger group % does not balance in %: sums to % (must be 0)',
        COALESCE(NEW.group_id, OLD.group_id), v_currency, v_sum
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS ledger_entries_balance_check ON public.ledger_entries;
CREATE CONSTRAINT TRIGGER ledger_entries_balance_check
  AFTER INSERT OR UPDATE OR DELETE ON public.ledger_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.ledger_assert_group_balanced();

-- Append-only. A correction is a NEW reversing group, never an edit: financial
-- history that can be quietly rewritten is not history.
CREATE OR REPLACE FUNCTION public.ledger_entries_forbid_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION
    'ledger_entries is append-only — correct with a reversing group, do not % an existing entry',
    lower(TG_OP)
    USING ERRCODE = 'restrict_violation';
END;
$$;

DROP TRIGGER IF EXISTS ledger_entries_no_update ON public.ledger_entries;
CREATE TRIGGER ledger_entries_no_update
  BEFORE UPDATE OR DELETE ON public.ledger_entries
  FOR EACH ROW EXECUTE FUNCTION public.ledger_entries_forbid_mutation();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Seed the chart, reflecting how money actually moves here
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.ledger_accounts (code, name, kind, normal_side, description) VALUES
  ('stripe_balance',        'Stripe balance',              'asset',     'debit',
   'Money sitting on the platform Stripe account, before payout to the bank.'),
  ('bank',                  'Bank account',                'asset',     'debit',
   'Money that has reached the platform bank account.'),
  ('stripe_in_transit',     'Payouts in transit',          'asset',     'debit',
   'Left the Stripe balance, not yet confirmed in the bank.'),

  ('talent_payable',        'Owed to talent',              'liability', 'credit',
   'Collected on the platform and owed to a talent. Cleared when the transfer settles.'),
  ('workspace_payable',     'Owed to workspaces',          'liability', 'credit',
   'Collected on the platform and owed to a workspace. Cleared when the transfer settles.'),
  ('client_credits',        'Client credit balances',      'liability', 'credit',
   'Funded client balances held on account, not yet spent.'),
  ('tax_payable',           'Tax collected, owed',         'liability', 'credit',
   'Tax collected on behalf of an authority. Zero today: no tax is collected anywhere yet.'),
  ('refunds_payable',       'Refunds owed',                'liability', 'credit',
   'Refund authorised but not yet settled at the provider.'),

  ('platform_commission',   'Platform commission',         'revenue',   'credit',
   'The platform take on a booking: client surcharge plus seller deduction.'),
  ('subscription_revenue',  'Subscription revenue',        'revenue',   'credit',
   'SaaS plan revenue, recognised when an invoice is paid.'),

  ('processing_fees',       'Payment processing fees',     'expense',   'debit',
   'What Stripe charged us. Read from balance transactions, never estimated.'),
  ('fx_loss',               'FX differences',              'expense',   'debit',
   'Difference arising when Stripe converts, e.g. a USD transfer landing in MXN.'),

  ('refunds_contra',        'Refunds issued',              'contra',    'debit',
   'Reduces revenue when money goes back to a client.'),
  ('disputes_contra',       'Disputes lost',               'contra',    'debit',
   'Reduces revenue when a chargeback is lost.')
ON CONFLICT (code) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RLS
--
-- The ledger is the platform's own books: it contains Tulala's margin, its
-- costs and every counterparty's balance side by side. Platform admins only.
-- Per-workspace and per-talent financial views are already served by the
-- commission snapshot and the payout ledger, both scoped to their owner.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.ledger_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_entries  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ledger_accounts_read_admin ON public.ledger_accounts;
CREATE POLICY ledger_accounts_read_admin
  ON public.ledger_accounts FOR SELECT TO authenticated
  USING (public.is_platform_admin());

DROP POLICY IF EXISTS ledger_entries_read_admin ON public.ledger_entries;
CREATE POLICY ledger_entries_read_admin
  ON public.ledger_entries FOR SELECT TO authenticated
  USING (public.is_platform_admin());

REVOKE ALL ON FUNCTION public.ledger_assert_group_balanced() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ledger_assert_group_balanced() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.ledger_entries_forbid_mutation() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ledger_entries_forbid_mutation() FROM anon, authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.ledger_accounts FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.ledger_entries  FROM PUBLIC, anon, authenticated;
REVOKE SELECT ON public.ledger_accounts FROM anon;
REVOKE SELECT ON public.ledger_entries  FROM anon;

DO $$
BEGIN
  IF has_table_privilege('anon', 'public.ledger_entries', 'SELECT')
     OR has_table_privilege('authenticated', 'public.ledger_entries', 'INSERT')
     OR has_table_privilege('authenticated', 'public.ledger_entries', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.ledger_accounts', 'INSERT')
  THEN
    RAISE EXCEPTION 'ledger: a revoke did not take';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.ledger_entries', 'INSERT') THEN
    RAISE EXCEPTION 'ledger: service_role cannot write — the projection would record nothing';
  END IF;
  IF (SELECT COUNT(*) FROM public.ledger_accounts) < 14 THEN
    RAISE EXCEPTION 'ledger: chart of accounts did not seed';
  END IF;
END $$;
