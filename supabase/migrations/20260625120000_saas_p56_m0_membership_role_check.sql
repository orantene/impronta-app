-- SaaS Phase 5/6 org-network extension — M0 step 6.
--
-- Ref: docs/saas/phase-5-6-org-network-extension.md §5.5, §6.2 step 6.
--
-- Context
--   `agency_memberships.role` is a TEXT column with a CHECK constraint
--   (see 20260601100100_saas_p1_agency_memberships.sql L19-20). It is NOT
--   a Postgres ENUM. Extending it is a drop+add of the CHECK constraint
--   — this is symmetric (rollback is the inverse), unlike enum ADD VALUE
--   which cannot be dropped cleanly.
--
-- What this migration does
--   1. Preflight: assert no row already uses the two new values, so rollback
--      to the original constraint is safe.
--   2. Swap CHECK: extend the allow-list with `hub_moderator` and
--      `platform_reviewer`.
--
-- What this migration does NOT do
--   - Does NOT assign any membership with the new roles. Platform admins
--     grant the hub_moderator role via the admin UI after M1 lands.
--   - Does NOT update TypeScript role union types
--     (web/src/lib/saas/tenant.ts:14). That is a code change tracked for
--     the M0 PR, not the migration.
--   - Does NOT change the capability matrix
--     (web/src/lib/saas/capabilities.ts). The new roles are "valid but
--     unmapped" after this migration — they may hold memberships but grant
--     no capabilities until the matrix is extended (planned for M3).

BEGIN;

-- ---------------------------------------------------------------------------
-- Preflight — no row should already use a new role value.
-- Accepting any such row would defeat the rollback safety of a CHECK swap.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_new_role_rows INT;
BEGIN
  SELECT COUNT(*) INTO v_new_role_rows
    FROM public.agency_memberships
   WHERE role IN ('hub_moderator','platform_reviewer');

  IF v_new_role_rows > 0 THEN
    RAISE EXCEPTION
      'M0 step-6 preflight: % agency_memberships row(s) already use '
      'hub_moderator/platform_reviewer. Refuse to swap the CHECK since '
      'rollback would leave them invalid.',
      v_new_role_rows;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Step 6 — swap the CHECK constraint.
--
-- Postgres supports DROP + ADD CONSTRAINT atomically within a transaction;
-- there is no window where the column has no CHECK.
-- ---------------------------------------------------------------------------

ALTER TABLE public.agency_memberships
  DROP CONSTRAINT IF EXISTS agency_memberships_role_check;

ALTER TABLE public.agency_memberships
  ADD CONSTRAINT agency_memberships_role_check
  CHECK (role IN (
    'owner',
    'admin',
    'coordinator',
    'editor',
    'viewer',
    'hub_moderator',
    'platform_reviewer'
  ));

COMMENT ON CONSTRAINT agency_memberships_role_check ON public.agency_memberships IS
  'Org-network extension M0 (step 6). Allow-list extended with hub_moderator '
  '(hub-kind orgs) and platform_reviewer (super-admin queue reviewers). '
  'Capability mapping for these two roles lands in M3 alongside the admin '
  'org selector; until then memberships may hold the value but grant no '
  'capabilities.';

-- ---------------------------------------------------------------------------
-- Validation — the new constraint accepts the new values (round-trip test
-- against an in-memory row builder, no writes).
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  -- ROW(...) with explicit casts triggers the domain-like CHECK at plan
  -- evaluation if we wrap in a no-op INSERT ... SELECT ... WHERE FALSE,
  -- but simpler: assert the constraint text contains the new values.
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'agency_memberships_role_check'
       AND pg_get_constraintdef(oid) LIKE '%hub_moderator%'
       AND pg_get_constraintdef(oid) LIKE '%platform_reviewer%'
  ) THEN
    RAISE EXCEPTION
      'M0 step-6 validation: constraint agency_memberships_role_check is '
      'missing one or both of the new role values.';
  END IF;
END
$$;

COMMIT;

-- ---------------------------------------------------------------------------
-- Rollback reference. Only safe while no row uses hub_moderator or
-- platform_reviewer — check with:
--   SELECT COUNT(*) FROM public.agency_memberships
--    WHERE role IN ('hub_moderator','platform_reviewer');
-- If zero, run:
--
-- BEGIN;
--   ALTER TABLE public.agency_memberships
--     DROP CONSTRAINT IF EXISTS agency_memberships_role_check;
--   ALTER TABLE public.agency_memberships
--     ADD CONSTRAINT agency_memberships_role_check
--     CHECK (role IN ('owner','admin','coordinator','editor','viewer'));
-- COMMIT;
