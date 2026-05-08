-- ============================================================================
-- Phase 8 — Stripe Connect (Express) per-tenant payouts (Oran 2026-05-07)
-- ============================================================================
--
-- Until now Stripe Checkout has run as a single-account integration: every
-- client payment lands in the platform's Stripe account, regardless of which
-- agency owns the booking. That doesn't scale to a multi-tenant SaaS — each
-- agency needs to receive its own funds and manage its own payouts.
--
-- This migration adds the per-agency Stripe Connect account binding using
-- **Express accounts**. Express is the right fit for an agency SaaS:
--   - Stripe-hosted onboarding (KYC, identity, bank account capture)
--   - Connected user gets a familiar Stripe Express dashboard
--   - Platform retains control over branding + permissions
--   - Simpler integration than Custom, lower friction than Standard
--
-- The columns track the lifecycle:
--
--   stripe_account_id           Stripe's id, format `acct_*`. Null until the
--                               agency starts onboarding.
--   stripe_account_status       Computed status string. Values:
--                                 'none'        — never connected
--                                 'pending'     — onboarding incomplete
--                                 'enabled'     — fully active (charges + payouts)
--                                 'restricted'  — Stripe paused some capability
--                                 'disabled'    — Stripe rejected / agency disconnected
--   stripe_charges_enabled      Mirror of Stripe's `charges_enabled` flag.
--                               Required true to route checkouts here.
--   stripe_payouts_enabled      Mirror of Stripe's `payouts_enabled` flag.
--   stripe_details_submitted    Mirror of `details_submitted`. False during
--                               onboarding, true after first submission.
--   stripe_account_synced_at    Last time we refreshed status from Stripe.
--                               Refresh strategy: on return-from-onboarding,
--                               on `account.updated` webhook, on demand from
--                               the agency settings page.
--
-- Charging model:
--   We use **Direct Charges** with `application_fee_amount`. The connected
--   account is on the hook for chargebacks / refunds; the platform receives
--   the application fee on each successful charge. Currently the fee defaults
--   to 0 — a future migration can add a per-agency `platform_fee_bps` column
--   (basis points) when the platform is ready to monetize.

-- ─── Columns ────────────────────────────────────────────────────────────────

ALTER TABLE public.agencies
  ADD COLUMN IF NOT EXISTS stripe_account_id text,
  ADD COLUMN IF NOT EXISTS stripe_account_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS stripe_charges_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_payouts_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_details_submitted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_account_synced_at timestamptz;

-- ─── Constraint: status enum ────────────────────────────────────────────────

ALTER TABLE public.agencies
  DROP CONSTRAINT IF EXISTS agencies_stripe_account_status_check;

ALTER TABLE public.agencies
  ADD CONSTRAINT agencies_stripe_account_status_check
  CHECK (stripe_account_status IN ('none', 'pending', 'enabled', 'restricted', 'disabled'));

-- ─── Constraint: account_id is unique (one Stripe acct per agency) ──────────

CREATE UNIQUE INDEX IF NOT EXISTS agencies_stripe_account_id_unique
  ON public.agencies(stripe_account_id)
  WHERE stripe_account_id IS NOT NULL;

-- ─── Reverse-lookup index for webhooks ──────────────────────────────────────
-- The Connect webhook handler receives `event.account` and needs to find
-- the agency. Same column as the unique index above; the unique index serves
-- both purposes (uniqueness + lookup).

-- ─── RLS: nothing changes ───────────────────────────────────────────────────
-- The new columns inherit the existing agencies-table RLS. Staff with the
-- `agency.workspace.edit` capability already see + edit their own agency
-- row; that's exactly who manages payouts.

COMMENT ON COLUMN public.agencies.stripe_account_id IS
  'Stripe Connect (Express) account id. Format: acct_*. Null until onboarding starts.';
COMMENT ON COLUMN public.agencies.stripe_account_status IS
  'Computed lifecycle: none|pending|enabled|restricted|disabled.';
COMMENT ON COLUMN public.agencies.stripe_charges_enabled IS
  'Mirror of Stripe charges_enabled. Must be true to route Checkout to this account.';
COMMENT ON COLUMN public.agencies.stripe_payouts_enabled IS
  'Mirror of Stripe payouts_enabled. Visible to the agency in their settings page.';
COMMENT ON COLUMN public.agencies.stripe_details_submitted IS
  'Mirror of Stripe details_submitted. False = onboarding flow incomplete.';
COMMENT ON COLUMN public.agencies.stripe_account_synced_at IS
  'Last refresh from Stripe. NULL means status is the default and never been synced.';

-- ─── stripe_processed_events: ensure compatible with Connect events ─────────
-- Migration 20260906100001 created `stripe_processed_events` for idempotency
-- of base webhook events. Connect events arrive at the same endpoint and use
-- the same `id` column for dedup, so no schema change is needed.
