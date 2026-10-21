-- TUL (security, P1): wave 1 of the "FOR ALL is_staff_of_tenant" RLS fix. Money and access tables.
--
-- HELD: lives in _pending_pm until the Production Migration Manager applies it after merge. NOT applied by the author.
--
-- Problem: 20260918000000_rls_staff_tenant_scope.sql (and earlier migrations) created FOR ALL policies gated on
-- is_staff_of_tenant(), which admits ANY membership role (viewer included), status 'pending_acceptance', and
-- platform admins. A viewer or a pending invitee can therefore write directly over PostgREST. Latent today
-- (prod has only owners/admins) but live with the first viewer/editor/manager seat or pending invite.
--
-- This migration does NOT change is_staff_of_tenant (it still gates legitimate SELECTs). It adds two helpers that
-- require an ACTIVE membership, then for the nine wave-1 tables splits each FOR ALL policy into:
--   * SELECT, unchanged predicate (is_staff_of_tenant), so reads do not change; plus
--   * either NO write policy (service-role-only writes; service_role bypasses RLS), or
--   * INSERT / UPDATE / DELETE gated on is_tenant_admin (active owner/admin, or platform admin).
-- Later waves (content tables on is_tenant_writer, mixed policies per table) each get their own version from the PM.
--
-- Role names: agency_memberships.role is owner|admin|manager|editor|viewer|hub_moderator|platform_reviewer
-- (legacy 'coordinator' is accepted as manager). hub_moderator and platform_reviewer are never writers.
--
-- Idempotent (DROP POLICY IF EXISTS before every CREATE). Rollback: drop the *_select / *_admin_* policies created
-- here and re-create the original FOR ALL policy named in each block (from the migration cited there).

BEGIN;

CREATE OR REPLACE FUNCTION public.is_tenant_writer(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1
        FROM public.agency_memberships m
       WHERE m.profile_id = auth.uid()
         AND m.tenant_id  = p_tenant_id
         AND m.status     = 'active'
         AND m.role IN ('owner', 'admin', 'manager', 'coordinator', 'editor')
    );
$$;

COMMENT ON FUNCTION public.is_tenant_writer(uuid) IS
  'Caller is an ACTIVE editor-or-above member of the tenant (owner, admin, manager, coordinator, editor) or a platform admin. Use for INSERT/UPDATE/DELETE policies; is_staff_of_tenant stays for SELECT.';

CREATE OR REPLACE FUNCTION public.is_tenant_admin(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1
        FROM public.agency_memberships m
       WHERE m.profile_id = auth.uid()
         AND m.tenant_id  = p_tenant_id
         AND m.status     = 'active'
         AND m.role IN ('owner', 'admin')
    );
$$;

COMMENT ON FUNCTION public.is_tenant_admin(uuid) IS
  'Caller is an ACTIVE owner or admin of the tenant, or a platform admin. Use for money and access tables.';

REVOKE ALL ON FUNCTION public.is_tenant_writer(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_tenant_admin(uuid)  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_tenant_writer(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_tenant_admin(uuid)  TO authenticated, service_role;

-- settings (service-role-only writes): every app write (flags-actions, ai-generation-model, ai-image-model) runs on the service-role client.
DO $$
BEGIN
  IF to_regclass('public.settings') IS NOT NULL THEN
    DROP POLICY IF EXISTS settings_staff ON public.settings;
    DROP POLICY IF EXISTS settings_staff_select ON public.settings;
    CREATE POLICY settings_staff_select ON public.settings
      FOR SELECT
      USING (public.is_staff_of_tenant(tenant_id));
  END IF;
END
$$;

-- ai_provider_instances (service-role-only writes): every app write (ai-provider-admin.ts) runs on the service-role client.
DO $$
BEGIN
  IF to_regclass('public.ai_provider_instances') IS NOT NULL THEN
    DROP POLICY IF EXISTS ai_provider_instances_staff ON public.ai_provider_instances;
    DROP POLICY IF EXISTS ai_provider_instances_staff_select ON public.ai_provider_instances;
    CREATE POLICY ai_provider_instances_staff_select ON public.ai_provider_instances
      FOR SELECT
      USING (public.is_staff_of_tenant(tenant_id));
  END IF;
END
$$;

-- tenant_integrations (service-role-only writes): writes go through integrations/repository.ts and platform email actions, both service-role.
DO $$
BEGIN
  IF to_regclass('public.tenant_integrations') IS NOT NULL THEN
    DROP POLICY IF EXISTS tenant_integrations_staff_all ON public.tenant_integrations;
    DROP POLICY IF EXISTS tenant_integrations_staff_select ON public.tenant_integrations;
    CREATE POLICY tenant_integrations_staff_select ON public.tenant_integrations
      FOR SELECT
      USING (public.is_staff_of_tenant(tenant_id));
  END IF;
END
$$;

-- team_invite_tokens (service-role-only writes): writes go through team-management.ts and team-invite route, both service-role.
DO $$
BEGIN
  IF to_regclass('public.team_invite_tokens') IS NOT NULL THEN
    DROP POLICY IF EXISTS team_invite_tokens_staff_all ON public.team_invite_tokens;
    DROP POLICY IF EXISTS team_invite_tokens_staff_select ON public.team_invite_tokens;
    CREATE POLICY team_invite_tokens_staff_select ON public.team_invite_tokens
      FOR SELECT
      USING (public.is_staff_of_tenant(tenant_id));
  END IF;
END
$$;

-- agency_entitlements (service-role-only writes): no authenticated-session app writes; plan changes are billing/service-role.
DO $$
BEGIN
  IF to_regclass('public.agency_entitlements') IS NOT NULL THEN
    DROP POLICY IF EXISTS agency_entitlements_tenant_staff ON public.agency_entitlements;
    DROP POLICY IF EXISTS agency_entitlements_staff_select ON public.agency_entitlements;
    CREATE POLICY agency_entitlements_staff_select ON public.agency_entitlements
      FOR SELECT
      USING (public.is_staff_of_tenant(tenant_id));
  END IF;
END
$$;

-- payout_accounts (admin+ writes): owner/admin manage payout accounts from the account page (user session).
DO $$
BEGIN
  IF to_regclass('public.payout_accounts') IS NOT NULL THEN
    DROP POLICY IF EXISTS payout_accounts_staff_write ON public.payout_accounts;
    DROP POLICY IF EXISTS payout_accounts_staff_select ON public.payout_accounts;
    CREATE POLICY payout_accounts_staff_select ON public.payout_accounts
      FOR SELECT
      USING (public.is_staff_of_tenant(tenant_id));

    DROP POLICY IF EXISTS payout_accounts_admin_insert ON public.payout_accounts;
    CREATE POLICY payout_accounts_admin_insert ON public.payout_accounts
      FOR INSERT
      WITH CHECK (public.is_tenant_admin(tenant_id));

    DROP POLICY IF EXISTS payout_accounts_admin_update ON public.payout_accounts;
    CREATE POLICY payout_accounts_admin_update ON public.payout_accounts
      FOR UPDATE
      USING       (public.is_tenant_admin(tenant_id))
      WITH CHECK  (public.is_tenant_admin(tenant_id));

    DROP POLICY IF EXISTS payout_accounts_admin_delete ON public.payout_accounts;
    CREATE POLICY payout_accounts_admin_delete ON public.payout_accounts
      FOR DELETE
      USING (public.is_tenant_admin(tenant_id));
  END IF;
END
$$;

-- booking_transactions (admin+ writes): money ledger; user-session writers (POS, orders) are admin+ today.
DO $$
BEGIN
  IF to_regclass('public.booking_transactions') IS NOT NULL THEN
    DROP POLICY IF EXISTS booking_transactions_staff_write ON public.booking_transactions;
    DROP POLICY IF EXISTS booking_transactions_staff_select ON public.booking_transactions;
    CREATE POLICY booking_transactions_staff_select ON public.booking_transactions
      FOR SELECT
      USING (public.is_staff_of_tenant(source_tenant_id));

    DROP POLICY IF EXISTS booking_transactions_admin_insert ON public.booking_transactions;
    CREATE POLICY booking_transactions_admin_insert ON public.booking_transactions
      FOR INSERT
      WITH CHECK (public.is_tenant_admin(source_tenant_id));

    DROP POLICY IF EXISTS booking_transactions_admin_update ON public.booking_transactions;
    CREATE POLICY booking_transactions_admin_update ON public.booking_transactions
      FOR UPDATE
      USING       (public.is_tenant_admin(source_tenant_id))
      WITH CHECK  (public.is_tenant_admin(source_tenant_id));

    DROP POLICY IF EXISTS booking_transactions_admin_delete ON public.booking_transactions;
    CREATE POLICY booking_transactions_admin_delete ON public.booking_transactions
      FOR DELETE
      USING (public.is_tenant_admin(source_tenant_id));
  END IF;
END
$$;

-- client_trust_state (admin+ writes): trust ladder state; evaluator may write on a user session.
DO $$
BEGIN
  IF to_regclass('public.client_trust_state') IS NOT NULL THEN
    DROP POLICY IF EXISTS client_trust_state_staff_write ON public.client_trust_state;
    DROP POLICY IF EXISTS client_trust_state_staff_select ON public.client_trust_state;
    CREATE POLICY client_trust_state_staff_select ON public.client_trust_state
      FOR SELECT
      USING (public.is_staff_of_tenant(tenant_id));

    DROP POLICY IF EXISTS client_trust_state_admin_insert ON public.client_trust_state;
    CREATE POLICY client_trust_state_admin_insert ON public.client_trust_state
      FOR INSERT
      WITH CHECK (public.is_tenant_admin(tenant_id));

    DROP POLICY IF EXISTS client_trust_state_admin_update ON public.client_trust_state;
    CREATE POLICY client_trust_state_admin_update ON public.client_trust_state
      FOR UPDATE
      USING       (public.is_tenant_admin(tenant_id))
      WITH CHECK  (public.is_tenant_admin(tenant_id));

    DROP POLICY IF EXISTS client_trust_state_admin_delete ON public.client_trust_state;
    CREATE POLICY client_trust_state_admin_delete ON public.client_trust_state
      FOR DELETE
      USING (public.is_tenant_admin(tenant_id));
  END IF;
END
$$;

-- agency_business_identity (admin+ writes): workspace identity edited from site-admin identity (user session).
DO $$
BEGIN
  IF to_regclass('public.agency_business_identity') IS NOT NULL THEN
    DROP POLICY IF EXISTS agency_business_identity_staff_all ON public.agency_business_identity;
    DROP POLICY IF EXISTS agency_business_identity_staff_select ON public.agency_business_identity;
    CREATE POLICY agency_business_identity_staff_select ON public.agency_business_identity
      FOR SELECT
      USING (public.is_staff_of_tenant(tenant_id));

    DROP POLICY IF EXISTS agency_business_identity_admin_insert ON public.agency_business_identity;
    CREATE POLICY agency_business_identity_admin_insert ON public.agency_business_identity
      FOR INSERT
      WITH CHECK (public.is_tenant_admin(tenant_id));

    DROP POLICY IF EXISTS agency_business_identity_admin_update ON public.agency_business_identity;
    CREATE POLICY agency_business_identity_admin_update ON public.agency_business_identity
      FOR UPDATE
      USING       (public.is_tenant_admin(tenant_id))
      WITH CHECK  (public.is_tenant_admin(tenant_id));

    DROP POLICY IF EXISTS agency_business_identity_admin_delete ON public.agency_business_identity;
    CREATE POLICY agency_business_identity_admin_delete ON public.agency_business_identity
      FOR DELETE
      USING (public.is_tenant_admin(tenant_id));
  END IF;
END
$$;

COMMIT;
