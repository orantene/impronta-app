-- Reservations R5 — a card on file, so a no-show costs the guest and not the venue.
--
-- THE CARD LIVES ON THE PLATFORM ACCOUNT, AND THERE IS NO OTHER OPTION.
-- Our connected accounts are onboarded under Stripe's `recipient` service
-- agreement with capability set {transfers}; per Stripe's own documentation
-- they "can't process payments or request the card_payments capability". They
-- cannot take a card at all. `stripe-checkout.ts` says the same thing in its
-- header and tells you not to reintroduce the branch. Money reaches a tenant by
-- `stripe.transfers.create` — separate charges and transfers.
--
-- An earlier draft of this table had a `stripe_account_id` column, to name the
-- connected account a card was saved on. That column existed because I read the
-- charge model out of a checkout 138 commits behind main whose working copy
-- still contained a branch main deleted two days earlier. There is no such
-- account. See docs/plans/reservations-plan.md §0 C1.
--
-- WHICH MAKES tenant_id A SECURITY BOUNDARY AND NOT A CONVENIENCE.
-- A PaymentMethod on the platform account is charge-able BY THE PLATFORM for
-- any tenant. Stripe will not stop a venue's no-show job charging a card saved
-- at a different venue, because as far as Stripe is concerned it is all one
-- account. The only thing standing between those two facts is this column and
-- the code above it. Every read carries it. There is no correct query against
-- this table that omits tenant_id.
--
-- NO CARD DATA IS STORED. brand, last4 and expiry come back from Stripe for
-- display and are the only card facts held here; the PaymentMethod id is a
-- handle, not a number.
--
-- WHY status AND NOT A DELETE. A card that Stripe detached, or that failed a
-- charge, is the record of why a no-show fee was not collected. Deleting it
-- leaves a venue asking why they were not paid and nothing able to answer.
--
-- Rollback: drop the table. Nothing references it.
--
-- APPLY WITH `node web/scripts/apply-migration.mjs --apply-pending`.

BEGIN;

CREATE TABLE IF NOT EXISTS public.customer_payment_methods (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID NOT NULL REFERENCES public.agencies(id)  ON DELETE CASCADE,
  customer_id              UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,

  -- Both on the PLATFORM account. See the header: there is no connected-account
  -- variant, because a `recipient` account cannot take a card.
  stripe_customer_id       TEXT NOT NULL,
  stripe_payment_method_id TEXT NOT NULL,

  brand      TEXT,
  last4      TEXT CHECK (last4 IS NULL OR last4 ~ '^[0-9]{4}$'),
  exp_month  INTEGER CHECK (exp_month IS NULL OR exp_month BETWEEN 1 AND 12),
  exp_year   INTEGER CHECK (exp_year  IS NULL OR exp_year BETWEEN 2020 AND 2100),

  status     TEXT NOT NULL DEFAULT 'active'
               CHECK (status IN ('active','detached','failed')),
  is_default BOOLEAN NOT NULL DEFAULT TRUE,
  last_charged_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.customer_payment_methods IS
  'A card a guest left on file so a no-show costs them rather than the venue. Lives on the PLATFORM Stripe account, because connected accounts are recipient-agreement {transfers} and cannot take a card. tenant_id is a SECURITY BOUNDARY here, not a convenience: Stripe cannot tell one tenant''s saved card from another''s, so only this column and the code above it stop a cross-tenant charge.';

COMMENT ON COLUMN public.customer_payment_methods.tenant_id IS
  'Security boundary. A platform-account PaymentMethod is charge-able by the platform for ANY tenant; there is no correct query against this table that omits this column.';

COMMENT ON COLUMN public.customer_payment_methods.status IS
  'A detached or failed card is the RECORD OF WHY a no-show fee was not collected. Never deleted, or a venue asks why they were not paid and nothing can answer.';

-- One row per PaymentMethod. Stripe ids are globally unique, so this also stops
-- the same card being registered twice under two customers by a retry.
CREATE UNIQUE INDEX IF NOT EXISTS customer_payment_methods_pm_uniq
  ON public.customer_payment_methods (stripe_payment_method_id);

-- One default per customer per tenant. Partial, so detached cards do not fight
-- the live one for the slot.
CREATE UNIQUE INDEX IF NOT EXISTS customer_payment_methods_default_uniq
  ON public.customer_payment_methods (tenant_id, customer_id)
  WHERE is_default AND status = 'active';

CREATE INDEX IF NOT EXISTS customer_payment_methods_customer_idx
  ON public.customer_payment_methods (tenant_id, customer_id)
  WHERE status = 'active';

-- ─── RLS ────────────────────────────────────────────────────────────────────
-- No SELECT policy for anyone. Staff do not read this table: the host stand
-- needs to know a card EXISTS, which is a boolean the server computes, not the
-- row. Writes and the charge path are service-role only.

ALTER TABLE public.customer_payment_methods ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE public.customer_payment_methods TO service_role;

COMMIT;
