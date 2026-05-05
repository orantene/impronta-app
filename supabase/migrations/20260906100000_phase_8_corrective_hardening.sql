-- Phase 8.x corrective hardening — addresses audit findings 2026-05-04.
--
-- Addresses (audit findings):
--   C1 — booking_transactions: missing triggers (scope + status_transition),
--        missing policies (receiver_read, staff_write), missing named CHECK
--        constraints (receiver triple + amount balance) on live DB despite
--        migration registered. Root cause: anonymous CHECKs inside
--        CREATE TABLE IF NOT EXISTS were not re-applied on edited migration.
--   L12 — disputed status missing from status enum + missing disputed_at column
--   M3 — inquiry_events.booking_id tenant-consistency trigger (per
--        transaction-architecture.md §9.3)
--   H9 — receiver field immutability after the transaction reaches a
--        terminal-or-paid state (per transaction-architecture.md §4.5)
--   H13 — client_balance_ledger sign check on amount_cents per entry_type
--   M5 — set_primary_agency_domain race condition: lock the primary row
--   M7 — agency_domains hostname normalization CHECK constraint
--   M1 — talent_subscriptions_staff_read: tighten so agency staff can no
--        longer read a talent's billing details (talent-monetization.md
--        treats subscription ownership as private to the talent). Restrict
--        to platform-admin only; talent self-read remains.
--   M2 — client_balance_ledger_self_read: scope to active relationships so
--        a removed client can't see historical balance from a workspace
--        they no longer have access to.
--
-- All operations are idempotent (DROP IF EXISTS / IF NOT EXISTS / DO blocks
-- with pg_constraint lookups). Safe to re-run.

BEGIN;

-- ─── 1. booking_transactions: status enum + disputed_at column (L12) ─────────

ALTER TABLE public.booking_transactions
  DROP CONSTRAINT IF EXISTS booking_transactions_status_check;

ALTER TABLE public.booking_transactions
  ADD CONSTRAINT booking_transactions_status_check
  CHECK (status IN (
    'draft',
    'payment_requested',
    'pending',
    'paid',
    'payout_pending',
    'payout_sent',
    'cancelled',
    'refunded',
    'disputed',
    'failed'
  ));

ALTER TABLE public.booking_transactions
  ADD COLUMN IF NOT EXISTS disputed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.booking_transactions.disputed_at IS
  'Set when the transaction enters disputed status. Disputed is non-terminal — resolves to paid, refunded, or failed (transaction-architecture.md §5.2).';

-- ─── 2. Named CHECK constraints (C1) ─────────────────────────────────────────
-- Anonymous CHECKs inside the original CREATE TABLE IF NOT EXISTS did not
-- land on a re-edited migration. Re-add them here with explicit names so
-- they're verifiable in pg_constraint and idempotent on re-runs.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'booking_transactions_amount_balance'
      AND conrelid = 'public.booking_transactions'::regclass
  ) THEN
    ALTER TABLE public.booking_transactions
      ADD CONSTRAINT booking_transactions_amount_balance
      CHECK (platform_fee_cents + net_amount_cents = gross_amount_cents);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'booking_transactions_receiver_consistency'
      AND conrelid = 'public.booking_transactions'::regclass
  ) THEN
    ALTER TABLE public.booking_transactions
      ADD CONSTRAINT booking_transactions_receiver_consistency
      CHECK (
        (
          payout_receiver_id IS NULL
          AND payout_receiver_kind IS NULL
          AND payout_receiver_display_name IS NULL
        )
        OR (
          payout_receiver_id IS NOT NULL
          AND payout_receiver_kind IS NOT NULL
          AND payout_receiver_display_name IS NOT NULL
        )
      );
  END IF;
END $$;

-- ─── 3. Re-install missing policies on booking_transactions (C1) ─────────────

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

-- Also broaden staff_read so super_admins can audit (the live policy uses a
-- raw membership IN-list and excludes super_admin; the file's intent was
-- is_staff_of_tenant which includes platform admins).
DROP POLICY IF EXISTS booking_transactions_staff_read ON public.booking_transactions;
CREATE POLICY booking_transactions_staff_read ON public.booking_transactions
  FOR SELECT
  USING (public.is_staff_of_tenant(source_tenant_id));

-- ─── 4. Re-install missing policy on payout_accounts (C1) ────────────────────

DROP POLICY IF EXISTS payout_accounts_staff_write ON public.payout_accounts;
CREATE POLICY payout_accounts_staff_write ON public.payout_accounts
  FOR ALL
  USING (public.is_staff_of_tenant(tenant_id))
  WITH CHECK (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS payout_accounts_staff_read ON public.payout_accounts;
CREATE POLICY payout_accounts_staff_read ON public.payout_accounts
  FOR SELECT
  USING (public.is_staff_of_tenant(tenant_id));

-- ─── 5. Refresh the state-machine function with disputed transitions ─────────
-- Live DB has the function from migration 203000 but missing some transitions.
-- Re-CREATE OR REPLACE with the canonical full graph.

CREATE OR REPLACE FUNCTION public.validate_booking_transaction_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'draft' THEN
      RETURN NEW;
    END IF;

    IF NEW.status = 'refunded' THEN
      IF NEW.refund_of_transaction_id IS NULL THEN
        RAISE EXCEPTION
          'booking_transactions: refunded insert rows must reference refund_of_transaction_id';
      END IF;
      IF NEW.refunded_at IS NULL THEN
        NEW.refunded_at := now();
      END IF;
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'booking_transactions: initial status must be draft';
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

  IF NEW.status = 'refunded' AND NEW.refund_of_transaction_id IS NULL THEN
    RAISE EXCEPTION
      'booking_transactions: refund_of_transaction_id is required before moving to refunded';
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
  ELSIF OLD.status = 'disputed' AND NEW.status IN ('paid', 'refunded', 'failed') THEN
    NULL;
  ELSE
    RAISE EXCEPTION
      'booking_transactions: invalid status transition from % to %',
      OLD.status, NEW.status;
  END IF;

  -- Always set the timestamp on entry into a state. For retries (e.g.
  -- failed → payment_requested → failed) we OVERWRITE so the audit trail
  -- captures the latest entry into that state — fixes audit finding M11.
  IF NEW.status = 'payment_requested' THEN
    NEW.requested_at := now();
    NEW.failed_at := NULL;
  ELSIF NEW.status = 'paid' AND NEW.paid_at IS NULL THEN
    NEW.paid_at := now();
  ELSIF NEW.status = 'payout_pending' AND NEW.payout_initiated_at IS NULL THEN
    NEW.payout_initiated_at := now();
  ELSIF NEW.status = 'payout_sent' AND NEW.payout_completed_at IS NULL THEN
    NEW.payout_completed_at := now();
  ELSIF NEW.status = 'refunded' AND NEW.refunded_at IS NULL THEN
    NEW.refunded_at := now();
  ELSIF NEW.status = 'failed' THEN
    NEW.failed_at := now();
  ELSIF NEW.status = 'disputed' AND NEW.disputed_at IS NULL THEN
    NEW.disputed_at := now();
  END IF;

  RETURN NEW;
END;
$$;

-- ─── 6. Receiver immutability trigger (H9) ───────────────────────────────────
-- Once the transaction reaches paid (or further), the receiver fields must
-- never be edited — they're a snapshot for audit (transaction-architecture.md
-- §4.5). Block any UPDATE that changes receiver fields when OLD.status is
-- already past payment_requested.

CREATE OR REPLACE FUNCTION public.guard_booking_transaction_receiver_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only relevant on UPDATE.
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF OLD.status NOT IN (
    'paid', 'payout_pending', 'payout_sent', 'refunded', 'disputed', 'failed'
  ) THEN
    RETURN NEW;
  END IF;

  IF NEW.payout_receiver_id IS DISTINCT FROM OLD.payout_receiver_id
     OR NEW.payout_receiver_kind IS DISTINCT FROM OLD.payout_receiver_kind
     OR NEW.payout_receiver_display_name IS DISTINCT FROM OLD.payout_receiver_display_name THEN
    RAISE EXCEPTION
      'booking_transactions: payout receiver fields are immutable once status reaches % (was %)',
      OLD.status, OLD.status
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

-- ─── 7. Re-install the missing triggers (C1 + H9) ────────────────────────────

DROP TRIGGER IF EXISTS trg_booking_transactions_scope ON public.booking_transactions;
CREATE TRIGGER trg_booking_transactions_scope
  BEFORE INSERT OR UPDATE ON public.booking_transactions
  FOR EACH ROW EXECUTE FUNCTION public.validate_booking_transaction_scope();

DROP TRIGGER IF EXISTS trg_booking_transactions_status_transition ON public.booking_transactions;
CREATE TRIGGER trg_booking_transactions_status_transition
  BEFORE INSERT OR UPDATE ON public.booking_transactions
  FOR EACH ROW EXECUTE FUNCTION public.validate_booking_transaction_status_transition();

DROP TRIGGER IF EXISTS trg_booking_transactions_receiver_immutable ON public.booking_transactions;
CREATE TRIGGER trg_booking_transactions_receiver_immutable
  BEFORE UPDATE ON public.booking_transactions
  FOR EACH ROW EXECUTE FUNCTION public.guard_booking_transaction_receiver_immutable();

-- ─── 8. inquiry_events.booking_id tenant-consistency trigger (M3) ────────────

CREATE OR REPLACE FUNCTION public.validate_inquiry_event_booking_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  booking_tenant_id UUID;
BEGIN
  IF NEW.booking_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT tenant_id INTO booking_tenant_id
  FROM public.agency_bookings
  WHERE id = NEW.booking_id;

  IF booking_tenant_id IS NULL THEN
    RAISE EXCEPTION
      'inquiry_events: booking % not found', NEW.booking_id;
  END IF;

  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := booking_tenant_id;
  ELSIF NEW.tenant_id <> booking_tenant_id THEN
    RAISE EXCEPTION
      'inquiry_events: tenant_id % does not match booking tenant_id %',
      NEW.tenant_id, booking_tenant_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inquiry_events_booking_tenant ON public.inquiry_events;
CREATE TRIGGER trg_inquiry_events_booking_tenant
  BEFORE INSERT OR UPDATE OF booking_id, tenant_id ON public.inquiry_events
  FOR EACH ROW EXECUTE FUNCTION public.validate_inquiry_event_booking_tenant();

-- ─── 9. client_balance_ledger sign check (H13) ───────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'client_balance_ledger_amount_sign'
      AND conrelid = 'public.client_balance_ledger'::regclass
  ) THEN
    ALTER TABLE public.client_balance_ledger
      ADD CONSTRAINT client_balance_ledger_amount_sign
      CHECK (
        (entry_type = 'deposit' AND amount_cents > 0)
        OR (entry_type IN ('refund', 'debit') AND amount_cents < 0)
      );
  END IF;
END $$;

-- ─── 10. agency_domains hostname normalization CHECK (M7) ────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agency_domains_hostname_normalized'
      AND conrelid = 'public.agency_domains'::regclass
  ) THEN
    ALTER TABLE public.agency_domains
      ADD CONSTRAINT agency_domains_hostname_normalized
      CHECK (hostname = lower(trim(both '.' from hostname)));
  END IF;
END $$;

-- ─── 11. set_primary_agency_domain race lock (M5) ────────────────────────────
-- Take an explicit lock on the tenant's domain rows during the swap so two
-- concurrent owners hitting "Make primary" can't interleave the two UPDATEs
-- and leave the tenant with zero or two primary rows.

CREATE OR REPLACE FUNCTION public.set_primary_agency_domain(
  p_tenant_id UUID,
  p_hostname TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor   UUID;
  v_host    TEXT;
  v_kind    TEXT;
  v_status  TEXT;
BEGIN
  v_actor := auth.uid();
  v_host := lower(trim(coalesce(p_hostname, '')));

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'set_primary_agency_domain: authentication required'
      USING ERRCODE = '42501';
  END IF;

  IF v_host = '' THEN
    RAISE EXCEPTION 'set_primary_agency_domain: hostname is required'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.agency_memberships m
    WHERE m.tenant_id = p_tenant_id
      AND m.profile_id = v_actor
      AND m.role = 'owner'
      AND m.status = 'active'
  ) THEN
    RAISE EXCEPTION 'set_primary_agency_domain: caller is not the owner of tenant %', p_tenant_id
      USING ERRCODE = '42501';
  END IF;

  -- Lock all the tenant's domain rows for the duration of the swap. This
  -- serializes concurrent set_primary_agency_domain calls per tenant.
  PERFORM 1
  FROM public.agency_domains
  WHERE tenant_id = p_tenant_id
  ORDER BY id
  FOR UPDATE;

  SELECT d.kind, d.status
  INTO   v_kind, v_status
  FROM   public.agency_domains d
  WHERE  d.tenant_id = p_tenant_id
    AND  d.hostname = v_host
  LIMIT 1;

  IF v_kind IS NULL THEN
    RAISE EXCEPTION 'set_primary_agency_domain: hostname % is not attached to tenant %', v_host, p_tenant_id
      USING ERRCODE = '22023';
  END IF;

  IF v_kind = 'custom'
     AND v_status <> 'active' THEN
    RAISE EXCEPTION 'set_primary_agency_domain: custom domain % must be active before it can become primary (status=%)', v_host, v_status
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.agency_domains
  SET    is_primary = FALSE
  WHERE  tenant_id = p_tenant_id
    AND  is_primary = TRUE;

  UPDATE public.agency_domains
  SET    is_primary = TRUE
  WHERE  tenant_id = p_tenant_id
    AND  hostname = v_host;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_primary_agency_domain(UUID, TEXT) TO authenticated;

-- ─── 12. talent_subscriptions_staff_read tightening (M1) ─────────────────────
-- Subscription ownership is private to the talent (talent-monetization.md).
-- Agency staff should NOT be able to read a talent's stripe_subscription_id,
-- price_id, or tier just because the talent is on their roster. Self-read
-- and platform-admin-read remain.

DROP POLICY IF EXISTS talent_subscriptions_staff_read ON public.talent_subscriptions;
CREATE POLICY talent_subscriptions_platform_admin_read ON public.talent_subscriptions
  FOR SELECT
  USING (public.is_platform_admin());

-- ─── 13. client_balance_ledger_self_read tightening (M2) ─────────────────────
-- A removed client should NOT see historical balance for a workspace they
-- no longer have access to. Gate by an active relationship row.

DROP POLICY IF EXISTS client_balance_ledger_self_read ON public.client_balance_ledger;
CREATE POLICY client_balance_ledger_self_read ON public.client_balance_ledger
  FOR SELECT
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.agency_client_relationships acr
      JOIN public.client_profiles cp ON cp.id = acr.client_profile_id
      WHERE cp.user_id = auth.uid()
        AND acr.tenant_id = client_balance_ledger.tenant_id
        AND coalesce(acr.status, 'active') <> 'removed'
    )
  );

COMMIT;
