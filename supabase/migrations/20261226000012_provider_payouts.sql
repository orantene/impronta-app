-- Persist Stripe payouts, so a bank deposit can be explained.
--
-- FOUND BY: the Finance/Payments day-one audit (2026-09-01), P1-3.
--
-- `payout.*` events were classified by the webhook router and then thrown away.
-- The handler's own comment said so: "Log only today. B5 will persist payout
-- history for agency visibility." In production it did not even log — the
-- improntaLog call sits behind `NODE_ENV !== "production"`.
--
-- The consequence is that nothing connects a Stripe payout to the deposit it
-- becomes in a bank account, on either side of the platform:
--
--   • PLATFORM payouts — Tulala's own money leaving Stripe for its bank. There
--     is no record that one was attempted, arrived, or failed. The account's
--     only external account is currently in `verification_failed`, so the first
--     real payout will fail, and today nothing anywhere would notice.
--   • CONNECTED-ACCOUNT payouts — a talent's or workspace's money leaving their
--     Express account for their bank. We tell them they were paid when the
--     TRANSFER succeeded, which is a different event from the money actually
--     landing.
--
-- This table is the provider-side record. It deliberately stores what Stripe
-- says and nothing derived: reconciliation against our own ledger is a separate
-- concern and must be able to disagree with us.
--
-- One row per Stripe payout id. Upserted by the webhook on every payout.* event
-- so the lifecycle (created → paid | failed | canceled) lands on ONE row rather
-- than accumulating duplicates.

CREATE TABLE IF NOT EXISTS public.provider_payouts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Provider identity. `stripe_payout_id` is the natural key; the upsert is
  -- keyed on it so redelivered events converge instead of duplicating.
  provider            TEXT NOT NULL DEFAULT 'stripe',
  stripe_payout_id    TEXT NOT NULL,

  -- NULL = a payout on the PLATFORM account (Tulala's own money reaching its
  -- bank). Non-null = a payout on a connected account, carried on `event.account`.
  stripe_account_id   TEXT,

  -- Who the connected account belongs to, resolved at write time where we can.
  -- Both null for a platform payout, and both null is also the honest answer
  -- for a connected account we cannot resolve — better than guessing.
  tenant_id           UUID REFERENCES public.agencies(id) ON DELETE SET NULL,
  talent_profile_id   UUID REFERENCES public.talent_profiles(id) ON DELETE SET NULL,

  -- Money exactly as Stripe reports it. Integer minor units, explicit currency.
  amount_cents        BIGINT NOT NULL,
  currency            TEXT NOT NULL,

  -- Stripe's own payout.status: paid | pending | in_transit | canceled | failed.
  -- Stored verbatim rather than mapped, so a status we have never seen before
  -- is recorded rather than silently coerced into one we have.
  status              TEXT NOT NULL,
  failure_code        TEXT,
  failure_message     TEXT,

  -- When the money is expected to land, per Stripe. This is the field that
  -- makes "where is my money" answerable.
  arrival_date        TIMESTAMPTZ,

  -- Payout method and destination, for matching against a bank statement.
  method              TEXT,
  destination_kind    TEXT,
  destination_last4   TEXT,

  -- The event that last touched this row, so a stale write is diagnosable.
  last_event_id       TEXT,
  last_event_type     TEXT,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT provider_payouts_amount_nonneg CHECK (amount_cents >= 0),
  CONSTRAINT provider_payouts_currency_len  CHECK (char_length(currency) = 3)
);

COMMENT ON TABLE public.provider_payouts IS
  'Provider-side record of Stripe payouts (platform and connected-account). One row per stripe_payout_id, upserted across the payout lifecycle. Stores what Stripe reports, not what we derive, so reconciliation can disagree with our own ledger. Added by the 2026-09-01 finance audit (P1-3).';

CREATE UNIQUE INDEX IF NOT EXISTS provider_payouts_stripe_id_key
  ON public.provider_payouts (stripe_payout_id);

-- "Show me this workspace's / talent's payouts, newest first" — the two reads
-- the dashboards will make.
CREATE INDEX IF NOT EXISTS provider_payouts_tenant_idx
  ON public.provider_payouts (tenant_id, arrival_date DESC NULLS LAST)
  WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS provider_payouts_talent_idx
  ON public.provider_payouts (talent_profile_id, arrival_date DESC NULLS LAST)
  WHERE talent_profile_id IS NOT NULL;

-- "Which payouts failed?" — the alerting read. Partial, because failures are
-- rare and this keeps the index tiny.
CREATE INDEX IF NOT EXISTS provider_payouts_failed_idx
  ON public.provider_payouts (status, updated_at DESC)
  WHERE status = 'failed';

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS. Deny by default; the webhook writes with the service role.
--
-- Reads are scoped to the money's owner: workspace staff see their workspace's
-- payouts, a talent sees their own, platform admins see everything. Nobody can
-- write from a client — payout state belongs to Stripe.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.provider_payouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS provider_payouts_read_own ON public.provider_payouts;
CREATE POLICY provider_payouts_read_own
  ON public.provider_payouts
  FOR SELECT
  TO authenticated
  USING (
    public.is_platform_admin()
    OR (tenant_id IS NOT NULL AND public.is_staff_of_tenant(tenant_id))
    OR (
      talent_profile_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.talent_profiles tp
        WHERE tp.id = provider_payouts.talent_profile_id
          AND tp.user_id = auth.uid()
      )
    )
  );

-- Platform payouts (stripe_account_id IS NULL) are Tulala's own money and are
-- covered by is_platform_admin() above. No separate policy: adding one that
-- matched on "tenant_id IS NULL" would expose them to every authenticated user.

CREATE OR REPLACE FUNCTION public.provider_payouts_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS provider_payouts_touch ON public.provider_payouts;
CREATE TRIGGER provider_payouts_touch
  BEFORE UPDATE ON public.provider_payouts
  FOR EACH ROW EXECUTE FUNCTION public.provider_payouts_touch_updated_at();

REVOKE ALL ON FUNCTION public.provider_payouts_touch_updated_at() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.provider_payouts_touch_updated_at() FROM anon, authenticated;

-- Defence in depth. RLS already denies these (there is no INSERT/UPDATE/DELETE
-- policy at all), but Supabase's default privileges hand table-level grants to
-- anon and authenticated on every new table, so the denial rests entirely on
-- RLS being correct. Payout state is provider truth: nothing client-side should
-- ever be able to write it, and anon should not read it even by accident.
--
-- Note both halves are required — a REVOKE from PUBLIC alone leaves the
-- EXPLICIT anon/authenticated grants in place. See migration 20261226000011.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.provider_payouts FROM PUBLIC, anon, authenticated;
REVOKE SELECT ON public.provider_payouts FROM anon;

DO $$
BEGIN
  IF has_table_privilege('anon', 'public.provider_payouts', 'SELECT')
     OR has_table_privilege('authenticated', 'public.provider_payouts', 'INSERT')
     OR has_table_privilege('authenticated', 'public.provider_payouts', 'UPDATE')
  THEN
    RAISE EXCEPTION 'provider_payouts: a revoke did not take — client roles still hold write or anon-read access';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.provider_payouts', 'INSERT') THEN
    RAISE EXCEPTION 'provider_payouts: service_role cannot write — the webhook would silently record nothing';
  END IF;
END $$;
