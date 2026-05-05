-- Phase 8.4 — Booking transactions + payout accounts.
--
-- Locked architecture per docs/transaction-architecture.md.
-- v1 model: provider = 'manual' (no Stripe wiring yet).
-- Platform fee is plan-driven (plan_fee_basis_points per plan tier).
--
-- Two new tables:
--   payout_accounts       — who can receive money for a workspace booking
--   booking_transactions  — canonical payment record per booking
--
-- booking_talent already exists (created in a prior migration).
-- inquiry_events already exists — we add a nullable booking_id FK below.

BEGIN;

-- ─── payout_accounts ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.payout_accounts (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID        NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  -- 'agency' | 'profile' | 'talent'
  owner_type       TEXT        NOT NULL
                     CHECK (owner_type IN ('agency', 'profile', 'talent')),
  -- polymorphic: agencies.id | profiles.id | talent_profiles.id
  owner_id         UUID        NOT NULL,
  display_name     TEXT        NOT NULL,
  -- v1: 'manual_bank'. v2+: 'stripe_connect', etc.
  provider         TEXT        NOT NULL DEFAULT 'manual_bank',
  -- v2+ Stripe Connect acct_xxx etc.
  provider_account_id TEXT,
  -- 'pending_verification' | 'connected' | 'restricted' | 'disconnected' | 'failed'
  status           TEXT        NOT NULL DEFAULT 'pending_verification'
                     CHECK (status IN (
                       'pending_verification', 'connected', 'restricted',
                       'disconnected', 'failed'
                     )),
  requirements_pending_jsonb JSONB NOT NULL DEFAULT '{}',
  connected_at     TIMESTAMPTZ,
  last_verified_at TIMESTAMPTZ,
  disconnected_at  TIMESTAMPTZ,
  created_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.payout_accounts IS
  'Normalized payout receiver accounts per workspace. One row per (tenant, owner_type, owner_id). Only status=connected accounts are eligible receiver candidates for booking transactions.';

-- One active account per (workspace, owner_type, owner_id)
CREATE UNIQUE INDEX IF NOT EXISTS idx_payout_accounts_unique_active
  ON public.payout_accounts (tenant_id, owner_type, owner_id)
  WHERE status IN ('pending_verification', 'connected');

CREATE INDEX IF NOT EXISTS idx_payout_accounts_tenant_connected
  ON public.payout_accounts (tenant_id)
  WHERE status = 'connected';

ALTER TABLE public.payout_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payout_accounts_staff_read ON public.payout_accounts;
CREATE POLICY payout_accounts_staff_read ON public.payout_accounts
  FOR SELECT
  USING (
    public.is_staff_of_tenant(tenant_id)
  );

DROP POLICY IF EXISTS payout_accounts_staff_write ON public.payout_accounts;
CREATE POLICY payout_accounts_staff_write ON public.payout_accounts
  FOR ALL
  USING (public.is_staff_of_tenant(tenant_id))
  WITH CHECK (public.is_staff_of_tenant(tenant_id));

-- ─── booking_transactions ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.booking_transactions (
  id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id                  UUID        NOT NULL REFERENCES public.agency_bookings(id) ON DELETE CASCADE,
  source_tenant_id            UUID        NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  source_inquiry_id           UUID        REFERENCES public.inquiries(id) ON DELETE SET NULL,
  payer_user_id               UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  payer_email                 TEXT,
  payout_receiver_id          UUID        REFERENCES public.payout_accounts(id) ON DELETE SET NULL,
  -- snapshot at selection-time
  payout_receiver_kind        TEXT
                                CHECK (payout_receiver_kind IN (
                                  'agency', 'admin', 'coordinator', 'talent'
                                )),
  payout_receiver_display_name TEXT,
  CHECK (
    (payout_receiver_id IS NULL AND payout_receiver_kind IS NULL AND payout_receiver_display_name IS NULL)
    OR
    (payout_receiver_id IS NOT NULL AND payout_receiver_kind IS NOT NULL AND payout_receiver_display_name IS NOT NULL)
  ),
  gross_amount_cents          BIGINT      NOT NULL CHECK (gross_amount_cents > 0),
  -- basis points (1000 = 10.00%, 1500 = 15.00%, 2000 = 20.00%)
  platform_fee_basis_points   INTEGER     NOT NULL CHECK (platform_fee_basis_points >= 0),
  platform_fee_cents          BIGINT      NOT NULL CHECK (platform_fee_cents >= 0),
  net_amount_cents            BIGINT      NOT NULL CHECK (net_amount_cents >= 0),
  CHECK (platform_fee_cents + net_amount_cents = gross_amount_cents),
  currency                    TEXT        NOT NULL DEFAULT 'USD',
  -- v1: 'manual'. v2+: 'stripe', 'mercado_pago', etc.
  provider                    TEXT        NOT NULL DEFAULT 'manual',
  provider_reference          TEXT,
  provider_metadata           JSONB       NOT NULL DEFAULT '{}',
  -- Status state machine (see docs/transaction-architecture.md §5)
  status                      TEXT        NOT NULL DEFAULT 'draft'
                                CHECK (status IN (
                                  'draft', 'payment_requested', 'pending',
                                  'paid', 'payout_pending', 'payout_sent',
                                  'cancelled', 'refunded', 'disputed', 'failed'
                                )),
  refund_of_transaction_id    UUID        REFERENCES public.booking_transactions(id),
  requested_at                TIMESTAMPTZ,
  paid_at                     TIMESTAMPTZ,
  payout_initiated_at         TIMESTAMPTZ,
  payout_completed_at         TIMESTAMPTZ,
  refunded_at                 TIMESTAMPTZ,
  failed_at                   TIMESTAMPTZ,
  failure_reason              TEXT,
  created_by_profile_id       UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.booking_transactions IS
  'Canonical payment record per booking (v1: manual provider). One active transaction per booking. Refunds produce a second linked row. Fee snapshotted at creation time from plan_fee_basis_points. State machine: draft → payment_requested → paid → payout_pending → payout_sent.';

-- One active (non-cancelled/refunded/failed) transaction per booking
CREATE UNIQUE INDEX IF NOT EXISTS idx_booking_transactions_booking_active
  ON public.booking_transactions (booking_id)
  WHERE status NOT IN ('cancelled', 'failed', 'refunded');

CREATE INDEX IF NOT EXISTS idx_booking_transactions_tenant
  ON public.booking_transactions (source_tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_booking_transactions_receiver
  ON public.booking_transactions (payout_receiver_id)
  WHERE status IN ('paid', 'payout_pending', 'payout_sent');

ALTER TABLE public.booking_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS booking_transactions_staff_read ON public.booking_transactions;
CREATE POLICY booking_transactions_staff_read ON public.booking_transactions
  FOR SELECT
  USING (public.is_staff_of_tenant(source_tenant_id));

DROP POLICY IF EXISTS booking_transactions_payer_read ON public.booking_transactions;
CREATE POLICY booking_transactions_payer_read ON public.booking_transactions
  FOR SELECT
  USING (payer_user_id = auth.uid());

DROP POLICY IF EXISTS booking_transactions_receiver_read ON public.booking_transactions;
CREATE POLICY booking_transactions_receiver_read ON public.booking_transactions
  FOR SELECT
  USING (
    payout_receiver_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.payout_accounts pa
      LEFT JOIN public.talent_profiles tp
        ON pa.owner_type = 'talent'
       AND tp.id = pa.owner_id
      WHERE pa.id = booking_transactions.payout_receiver_id
        AND pa.tenant_id = booking_transactions.source_tenant_id
        AND (
          (pa.owner_type = 'profile' AND pa.owner_id = auth.uid())
          OR
          (pa.owner_type = 'talent' AND tp.user_id = auth.uid())
        )
    )
  );

DROP POLICY IF EXISTS booking_transactions_staff_write ON public.booking_transactions;
CREATE POLICY booking_transactions_staff_write ON public.booking_transactions
  FOR ALL
  USING (public.is_staff_of_tenant(source_tenant_id))
  WITH CHECK (public.is_staff_of_tenant(source_tenant_id));

-- ─── Invariants + state machine guards ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.validate_booking_transaction_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  booking_tenant_id UUID;
  booking_source_inquiry UUID;
  inquiry_tenant_id UUID;
  receiver_tenant_id UUID;
BEGIN
  SELECT tenant_id, source_inquiry_id
    INTO booking_tenant_id, booking_source_inquiry
  FROM public.agency_bookings
  WHERE id = NEW.booking_id;

  IF booking_tenant_id IS NULL THEN
    RAISE EXCEPTION 'booking_transactions: booking % not found or has no tenant_id', NEW.booking_id;
  END IF;

  IF NEW.source_tenant_id <> booking_tenant_id THEN
    RAISE EXCEPTION
      'booking_transactions: source_tenant_id % does not match booking tenant_id %',
      NEW.source_tenant_id, booking_tenant_id;
  END IF;

  IF NEW.source_inquiry_id IS NOT NULL THEN
    SELECT tenant_id INTO inquiry_tenant_id
    FROM public.inquiries
    WHERE id = NEW.source_inquiry_id;

    IF inquiry_tenant_id IS NULL THEN
      RAISE EXCEPTION 'booking_transactions: source inquiry % not found', NEW.source_inquiry_id;
    END IF;

    IF inquiry_tenant_id <> NEW.source_tenant_id THEN
      RAISE EXCEPTION
        'booking_transactions: source inquiry tenant % does not match source_tenant_id %',
        inquiry_tenant_id, NEW.source_tenant_id;
    END IF;
  END IF;

  IF booking_source_inquiry IS NOT NULL
     AND NEW.source_inquiry_id IS NOT NULL
     AND booking_source_inquiry <> NEW.source_inquiry_id THEN
    RAISE EXCEPTION
      'booking_transactions: source inquiry % does not match booking.source_inquiry_id %',
      NEW.source_inquiry_id, booking_source_inquiry;
  END IF;

  IF NEW.payout_receiver_id IS NOT NULL THEN
    SELECT tenant_id INTO receiver_tenant_id
    FROM public.payout_accounts
    WHERE id = NEW.payout_receiver_id;

    IF receiver_tenant_id IS NULL THEN
      RAISE EXCEPTION 'booking_transactions: payout receiver % not found', NEW.payout_receiver_id;
    END IF;

    IF receiver_tenant_id <> NEW.source_tenant_id THEN
      RAISE EXCEPTION
        'booking_transactions: payout receiver tenant % does not match source_tenant_id %',
        receiver_tenant_id, NEW.source_tenant_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_booking_transaction_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' THEN
      RAISE EXCEPTION 'booking_transactions: initial status must be draft';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status IN ('payment_requested', 'pending', 'paid', 'payout_pending', 'payout_sent')
     AND NEW.payout_receiver_id IS NULL THEN
    RAISE EXCEPTION
      'booking_transactions: payout_receiver_id is required before moving to status %',
      NEW.status;
  END IF;

  IF OLD.status = 'draft' AND NEW.status IN ('payment_requested', 'cancelled') THEN
    NULL;
  ELSIF OLD.status = 'payment_requested' AND NEW.status IN ('pending', 'paid', 'cancelled', 'failed') THEN
    NULL;
  ELSIF OLD.status = 'pending' AND NEW.status IN ('paid', 'failed', 'cancelled') THEN
    NULL;
  ELSIF OLD.status = 'paid' AND NEW.status IN ('payout_pending', 'refunded', 'disputed') THEN
    NULL;
  ELSIF OLD.status = 'payout_pending' AND NEW.status IN ('payout_sent', 'refunded', 'failed') THEN
    NULL;
  ELSIF OLD.status = 'payout_sent' AND NEW.status IN ('refunded') THEN
    NULL;
  ELSIF OLD.status = 'failed' AND NEW.status IN ('payment_requested', 'cancelled') THEN
    NULL;
  ELSIF OLD.status = 'disputed' AND NEW.status IN ('refunded', 'failed') THEN
    NULL;
  ELSE
    RAISE EXCEPTION
      'booking_transactions: invalid status transition from % to %',
      OLD.status, NEW.status;
  END IF;

  IF NEW.status = 'payment_requested' AND NEW.requested_at IS NULL THEN
    NEW.requested_at := now();
  ELSIF NEW.status = 'paid' AND NEW.paid_at IS NULL THEN
    NEW.paid_at := now();
  ELSIF NEW.status = 'payout_pending' AND NEW.payout_initiated_at IS NULL THEN
    NEW.payout_initiated_at := now();
  ELSIF NEW.status = 'payout_sent' AND NEW.payout_completed_at IS NULL THEN
    NEW.payout_completed_at := now();
  ELSIF NEW.status = 'refunded' AND NEW.refunded_at IS NULL THEN
    NEW.refunded_at := now();
  ELSIF NEW.status = 'failed' AND NEW.failed_at IS NULL THEN
    NEW.failed_at := now();
  END IF;

  RETURN NEW;
END;
$$;

-- ─── inquiry_events.booking_id extension ─────────────────────────────────────
-- Per transaction-architecture.md §2.4: extend inquiry_events with booking_id
-- so payment events log alongside inquiry lifecycle events.

ALTER TABLE public.inquiry_events
  ADD COLUMN IF NOT EXISTS booking_id UUID REFERENCES public.agency_bookings(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.inquiry_events.booking_id IS
  'Set when the event relates to a booking/payment phase. Null for inquiry-phase events. Allows payment state changes to log in the same event stream (transaction-architecture.md §2.4).';

CREATE INDEX IF NOT EXISTS idx_inquiry_events_booking_id
  ON public.inquiry_events (booking_id)
  WHERE booking_id IS NOT NULL;

-- ─── Updated-at trigger ───────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_payout_accounts_updated_at ON public.payout_accounts;
CREATE TRIGGER trg_payout_accounts_updated_at
  BEFORE UPDATE ON public.payout_accounts
  FOR EACH ROW EXECUTE FUNCTION public.billing_touch_updated_at();

DROP TRIGGER IF EXISTS trg_booking_transactions_updated_at ON public.booking_transactions;
CREATE TRIGGER trg_booking_transactions_updated_at
  BEFORE UPDATE ON public.booking_transactions
  FOR EACH ROW EXECUTE FUNCTION public.billing_touch_updated_at();

DROP TRIGGER IF EXISTS trg_booking_transactions_scope ON public.booking_transactions;
CREATE TRIGGER trg_booking_transactions_scope
  BEFORE INSERT OR UPDATE ON public.booking_transactions
  FOR EACH ROW EXECUTE FUNCTION public.validate_booking_transaction_scope();

DROP TRIGGER IF EXISTS trg_booking_transactions_status_transition ON public.booking_transactions;
CREATE TRIGGER trg_booking_transactions_status_transition
  BEFORE INSERT OR UPDATE ON public.booking_transactions
  FOR EACH ROW EXECUTE FUNCTION public.validate_booking_transaction_status_transition();

COMMIT;
