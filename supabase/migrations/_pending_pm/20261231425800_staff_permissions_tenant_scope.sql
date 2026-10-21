-- 20261231425800_staff_permissions_tenant_scope.sql  (TUL-1813, follow-up of TUL-1805)
--
-- HELD in _pending_pm. PM-reserved version. NEVER applied by an agent; no db push.
-- The PMM applies it.
--
-- ============================================================================
-- APPLY ORDER (the PMM follows THIS, not the version number):
--   1. DEPLOY THE CODE FIRST. The PR for this migration ships readers/writers
--      that work under BOTH table shapes (tenant filter when tenant_id exists,
--      fallback when it does not; no maybeSingle()/single() on a
--      (user_id, permission) lookup).
--   2. THEN apply this migration (425800).
--
-- FAILURE MODE if 425800 is applied BEFORE the code is live: the backfill
-- multiplies one (user_id, permission) row into one row per active membership,
-- so OLD readers that do .eq('user_id', x).eq('permission', y).maybeSingle()
-- error on >1 row (PGRST116) and fail closed (deny) for multi-workspace
-- users, and old writers that upsert onConflict 'user_id,permission' fail
-- because that unique constraint no longer exists.
-- Applying the code first and the migration second has no failure window.
-- ============================================================================
--
-- Problem: public.staff_permissions was global per user (PK user_id, permission).
-- An admin of tenant A granting 'messages.refund' to a user who also works in
-- tenant B silently turned tenant B into a configured (holders-only) tenant.
--
-- Fix: add tenant_id; PK (user_id, tenant_id, permission); backfill one row
-- per ACTIVE membership of the user; RLS = active owner/admin of THAT row's
-- tenant (or platform admin).
--
-- Backfill decision: only status = 'active' memberships get rows. Invited,
-- pending_acceptance, suspended, removed and expired_invite get none (they are
-- not on the roster that hasMessagingMoneyPermission reads). Legacy global
-- rows for a user with NO active membership cannot be assigned a tenant and
-- are removed (they were unreachable: the reader only sees active staff).
-- Copying a global grant to each active workspace preserves today's effective
-- behaviour exactly; each workspace admin can then revoke per tenant.
--
-- Supersedes the staff_permissions_staff policy from held 20261231425600
-- (#4411, sorts before this file). Safe whether 425600 was applied or not:
-- every DROP is IF EXISTS. The helper staff_is_admin_of_user_tenant (from
-- 425600) is intentionally LEFT in place; drop it in a later migration once
-- confirmed unused.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'staff_permissions' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE public.staff_permissions
      ADD COLUMN tenant_id UUID REFERENCES public.agencies (id) ON DELETE CASCADE;

    -- The old PK (user_id, permission) blocks one-row-per-tenant copies.
    ALTER TABLE public.staff_permissions DROP CONSTRAINT IF EXISTS staff_permissions_pkey;

    -- Backfill: one row per active membership of the user.
    INSERT INTO public.staff_permissions (user_id, permission, tenant_id)
    SELECT sp.user_id, sp.permission, m.tenant_id
    FROM public.staff_permissions sp
    JOIN public.agency_memberships m
      ON m.profile_id = sp.user_id AND m.status = 'active'
    WHERE sp.tenant_id IS NULL;

    -- Drop the un-scoped originals (copied above, or unassignable).
    DELETE FROM public.staff_permissions WHERE tenant_id IS NULL;

    ALTER TABLE public.staff_permissions ALTER COLUMN tenant_id SET NOT NULL;
    ALTER TABLE public.staff_permissions
      ADD CONSTRAINT staff_permissions_pkey PRIMARY KEY (user_id, tenant_id, permission);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS staff_permissions_tenant_permission_idx
  ON public.staff_permissions (tenant_id, permission);

-- RLS: active owner/admin of THAT row's tenant, or platform admin.
ALTER TABLE public.staff_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_permissions_staff ON public.staff_permissions;
DROP POLICY IF EXISTS staff_permissions_select_tenant_admin ON public.staff_permissions;
DROP POLICY IF EXISTS staff_permissions_insert_tenant_admin ON public.staff_permissions;
DROP POLICY IF EXISTS staff_permissions_update_tenant_admin ON public.staff_permissions;
DROP POLICY IF EXISTS staff_permissions_delete_tenant_admin ON public.staff_permissions;

CREATE POLICY staff_permissions_select_tenant_admin ON public.staff_permissions
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.agency_memberships m
      WHERE m.profile_id = auth.uid()
        AND m.status = 'active'
        AND m.role IN ('owner', 'admin')
        AND m.tenant_id = staff_permissions.tenant_id
    )
  );

CREATE POLICY staff_permissions_insert_tenant_admin ON public.staff_permissions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.agency_memberships m
      WHERE m.profile_id = auth.uid()
        AND m.status = 'active'
        AND m.role IN ('owner', 'admin')
        AND m.tenant_id = staff_permissions.tenant_id
    )
  );

CREATE POLICY staff_permissions_update_tenant_admin ON public.staff_permissions
  FOR UPDATE TO authenticated
  USING (
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.agency_memberships m
      WHERE m.profile_id = auth.uid()
        AND m.status = 'active'
        AND m.role IN ('owner', 'admin')
        AND m.tenant_id = staff_permissions.tenant_id
    )
  )
  WITH CHECK (
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.agency_memberships m
      WHERE m.profile_id = auth.uid()
        AND m.status = 'active'
        AND m.role IN ('owner', 'admin')
        AND m.tenant_id = staff_permissions.tenant_id
    )
  );

CREATE POLICY staff_permissions_delete_tenant_admin ON public.staff_permissions
  FOR DELETE TO authenticated
  USING (
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.agency_memberships m
      WHERE m.profile_id = auth.uid()
        AND m.status = 'active'
        AND m.role IN ('owner', 'admin')
        AND m.tenant_id = staff_permissions.tenant_id
    )
  );
