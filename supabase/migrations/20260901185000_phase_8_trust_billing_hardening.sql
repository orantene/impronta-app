-- Phase 8.3 hardening -- client trust + billing isolation repairs.
--
-- This migration intentionally lands after Phase 8.3 and before the Phase 8.4
-- booking-transaction WIP. It repairs gaps found during the Phase 0-8.3 audit:
--   * enforce tenant-scoped staff RLS on billing/trust tables,
--   * make client balance Stripe webhooks idempotent at the database layer,
--   * constrain/index the trust snapshot carried on inquiries,
--   * add updated_at triggers to trust preference tables.

BEGIN;

-- Trust snapshots are a presentation/query signal on inquiry rows. Keep them
-- nullable for historical rows, but constrain new populated values.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'inquiries_trust_level_at_submission_check'
      AND conrelid = 'public.inquiries'::regclass
  ) THEN
    ALTER TABLE public.inquiries
      ADD CONSTRAINT inquiries_trust_level_at_submission_check
      CHECK (
        trust_level_at_submission IS NULL
        OR trust_level_at_submission IN ('basic', 'verified', 'silver', 'gold')
      );
  END IF;
END $$;

COMMENT ON COLUMN public.inquiries.trust_level_at_submission IS
  'Client trust tier snapshot at inquiry submission time. Null on historical rows.';

CREATE INDEX IF NOT EXISTS idx_inquiries_trust_level_submission
  ON public.inquiries (tenant_id, trust_level_at_submission, created_at DESC)
  WHERE trust_level_at_submission IS NOT NULL;

-- Phase 3.7 trust tables: staff writes must be scoped by tenant, and talent
-- self-writes must be scoped to a real roster relationship in that tenant.
DROP POLICY IF EXISTS client_trust_state_staff_read ON public.client_trust_state;
CREATE POLICY client_trust_state_staff_read
  ON public.client_trust_state
  FOR SELECT
  USING (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS client_trust_state_staff_write ON public.client_trust_state;
CREATE POLICY client_trust_state_staff_write
  ON public.client_trust_state
  FOR ALL
  USING (public.is_staff_of_tenant(tenant_id))
  WITH CHECK (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS talent_contact_prefs_staff ON public.talent_contact_preferences;
CREATE POLICY talent_contact_prefs_staff
  ON public.talent_contact_preferences
  FOR ALL
  USING (public.is_staff_of_tenant(tenant_id))
  WITH CHECK (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS talent_contact_prefs_own ON public.talent_contact_preferences;
CREATE POLICY talent_contact_prefs_own
  ON public.talent_contact_preferences
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.talent_profiles tp
      JOIN public.agency_talent_roster atr
        ON atr.talent_profile_id = tp.id
       AND atr.tenant_id = talent_contact_preferences.tenant_id
       AND atr.status <> 'removed'
      WHERE tp.id = talent_contact_preferences.talent_profile_id
        AND tp.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.talent_profiles tp
      JOIN public.agency_talent_roster atr
        ON atr.talent_profile_id = tp.id
       AND atr.tenant_id = talent_contact_preferences.tenant_id
       AND atr.status <> 'removed'
      WHERE tp.id = talent_contact_preferences.talent_profile_id
        AND tp.user_id = auth.uid()
    )
  );

DROP TRIGGER IF EXISTS trg_client_trust_state_updated_at ON public.client_trust_state;
CREATE TRIGGER trg_client_trust_state_updated_at
  BEFORE UPDATE ON public.client_trust_state
  FOR EACH ROW EXECUTE FUNCTION public.billing_touch_updated_at();

DROP TRIGGER IF EXISTS trg_talent_contact_preferences_updated_at ON public.talent_contact_preferences;
CREATE TRIGGER trg_talent_contact_preferences_updated_at
  BEFORE UPDATE ON public.talent_contact_preferences
  FOR EACH ROW EXECUTE FUNCTION public.billing_touch_updated_at();

-- Phase 8.1 billing tables: these rows are tenant-owned. The original policies
-- used global agency-staff checks; rebind them to is_staff_of_tenant.
DROP POLICY IF EXISTS stripe_customers_staff_read ON public.stripe_customers;
CREATE POLICY stripe_customers_staff_read
  ON public.stripe_customers
  FOR SELECT
  USING (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS workspace_subscriptions_staff_read ON public.workspace_subscriptions;
CREATE POLICY workspace_subscriptions_staff_read
  ON public.workspace_subscriptions
  FOR SELECT
  USING (public.is_staff_of_tenant(tenant_id));

-- Phase 8.2 talent subscription staff reads must be scoped through the roster
-- tenant, not through global agency staff membership.
DROP POLICY IF EXISTS talent_subscriptions_staff_read ON public.talent_subscriptions;
CREATE POLICY talent_subscriptions_staff_read
  ON public.talent_subscriptions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.agency_talent_roster atr
      WHERE atr.talent_profile_id = talent_subscriptions.talent_profile_id
        AND atr.status <> 'removed'
        AND public.is_staff_of_tenant(atr.tenant_id)
    )
  );

-- Phase 8.3 client balance ledger: fix the staff policy typo
-- (agency_memberships has profile_id, not user_id) by using the tenant helper.
DROP POLICY IF EXISTS client_balance_ledger_staff_read ON public.client_balance_ledger;
CREATE POLICY client_balance_ledger_staff_read
  ON public.client_balance_ledger
  FOR SELECT
  USING (public.is_staff_of_tenant(tenant_id));

-- Stripe sends webhook retries. A payment_intent must credit the balance once.
DROP INDEX IF EXISTS idx_client_balance_ledger_payment_intent;
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_balance_ledger_payment_intent_unique
  ON public.client_balance_ledger (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

COMMIT;
