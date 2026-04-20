-- SaaS Phase 5/6 org-network extension — M0 step 4-5.
--
-- Ref: docs/saas/phase-5-6-org-network-extension.md §5.3, §6.2 steps 4-5.
--
-- What this migration does
--   1. Rewrite `agency_domains_tenant_scope_check` so that `kind='hub'` rows
--      are REQUIRED to carry a tenant_id (previously required to be NULL).
--   2. Rebind the two existing kind='hub' rows (`pitiriasisversicolor.com`,
--      `hub.local`) to the platform hub org's UUID (seeded in migration
--      20260625100000).
--
-- Atomicity
--   Both changes run in a single transaction. Mid-migration the middleware
--   will see the constraint drop + re-add atomically; the edge cache for
--   domain resolution (60s TTL) absorbs the brief inconsistency.
--
-- Preflight (enforced below)
--   - The hub org (slug='hub') must exist. If migration 20260625100000 was
--     not applied, this migration aborts.
--   - No kind='hub' row must already have a non-matching tenant_id. If the
--     rebind would overwrite an unexpected owner, abort.
--
-- Idempotent via ON CONFLICT / WHERE-guarded UPDATE.

BEGIN;

-- ---------------------------------------------------------------------------
-- Preflight — hub org must exist before we rebind domains to it.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_hub_id UUID;
BEGIN
  SELECT id INTO v_hub_id
    FROM public.agencies
   WHERE kind = 'hub'::public.organization_kind
     AND slug = 'hub'
   LIMIT 1;

  IF v_hub_id IS NULL THEN
    RAISE EXCEPTION
      'M0 step-4 preflight: no kind=''hub'' agency with slug=''hub'' found. '
      'Apply migration 20260625100000 first.';
  END IF;

  IF v_hub_id <> '00000000-0000-0000-0000-000000000002'::UUID THEN
    RAISE EXCEPTION
      'M0 step-4 preflight: hub org UUID is % (expected L48 value '
      '00000000-0000-0000-0000-000000000002). Abort rather than rebind to '
      'an unexpected id.', v_hub_id;
  END IF;
END
$$;

-- Also assert that any kind='hub' agency_domains row either has NULL
-- tenant_id (legitimate legacy state) or already points at our hub UUID
-- (idempotent re-run). Any other value means a different actor claimed a
-- hub hostname — refuse to silently overwrite.
DO $$
DECLARE
  v_unexpected INT;
BEGIN
  SELECT COUNT(*) INTO v_unexpected
    FROM public.agency_domains
   WHERE kind = 'hub'
     AND tenant_id IS NOT NULL
     AND tenant_id <> '00000000-0000-0000-0000-000000000002'::UUID;
  IF v_unexpected > 0 THEN
    RAISE EXCEPTION
      'M0 step-5 preflight: % agency_domains row(s) with kind=''hub'' point '
      'at an unexpected tenant_id. Resolve manually before re-running.',
      v_unexpected;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Step 4 — relax the tenant-scope CHECK for kind='hub'.
--
-- Previous constraint (from 20260605100000_saas_p4_unified_domain_registry):
--   (kind IN ('subdomain','custom')       AND tenant_id IS NOT NULL)
--   OR (kind IN ('marketing','app','hub') AND tenant_id IS NULL)
-- New:
--   (kind IN ('subdomain','custom','hub') AND tenant_id IS NOT NULL)
--   OR (kind IN ('marketing','app')       AND tenant_id IS NULL)
--
-- Effect: hub rows move from "must be orphaned" to "must be bound to an
-- org row". `marketing` and `app` remain platform-global (NULL tenant_id).
-- ---------------------------------------------------------------------------

ALTER TABLE public.agency_domains
  DROP CONSTRAINT IF EXISTS agency_domains_tenant_scope_check;

ALTER TABLE public.agency_domains
  ADD CONSTRAINT agency_domains_tenant_scope_check
  CHECK (
    (kind IN ('subdomain','custom','hub') AND tenant_id IS NOT NULL)
    OR (kind IN ('marketing','app')       AND tenant_id IS NULL)
  );

COMMENT ON CONSTRAINT agency_domains_tenant_scope_check ON public.agency_domains IS
  'Org-network extension M0 (step 4). Hub rows carry tenant_id pointing at '
  'the platform-hub agency (kind=''hub''). marketing/app rows remain '
  'platform-global (NULL tenant_id). subdomain/custom remain tenant-bound.';

-- ---------------------------------------------------------------------------
-- Step 5 — rebind existing hub rows.
--
-- Applied BEFORE any INSERT of new hub rows could occur, because the new
-- constraint (step 4) already forbids a hub row with NULL tenant_id. The
-- single-transaction property guarantees no window where the old
-- constraint is gone but the new one isn't yet installed.
-- ---------------------------------------------------------------------------

UPDATE public.agency_domains
   SET tenant_id = '00000000-0000-0000-0000-000000000002'::UUID,
       updated_at = now()
 WHERE kind = 'hub'
   AND (tenant_id IS NULL
        OR tenant_id = '00000000-0000-0000-0000-000000000002'::UUID);

-- ---------------------------------------------------------------------------
-- Validation — every hub row now has tenant_id set, and it is the hub UUID.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_orphaned INT;
  v_wrong_tenant INT;
BEGIN
  SELECT COUNT(*) INTO v_orphaned
    FROM public.agency_domains
   WHERE kind = 'hub' AND tenant_id IS NULL;
  IF v_orphaned > 0 THEN
    RAISE EXCEPTION 'M0 step-5 validation: % agency_domains rows with kind=''hub'' still have NULL tenant_id', v_orphaned;
  END IF;

  SELECT COUNT(*) INTO v_wrong_tenant
    FROM public.agency_domains
   WHERE kind = 'hub'
     AND tenant_id <> '00000000-0000-0000-0000-000000000002'::UUID;
  IF v_wrong_tenant > 0 THEN
    RAISE EXCEPTION 'M0 step-5 validation: % agency_domains rows with kind=''hub'' point at an unexpected tenant_id', v_wrong_tenant;
  END IF;
END
$$;

COMMIT;

-- ---------------------------------------------------------------------------
-- Rollback reference (manual). Run inside a transaction.
-- ---------------------------------------------------------------------------
--
-- BEGIN;
--   UPDATE public.agency_domains
--      SET tenant_id = NULL, updated_at = now()
--    WHERE kind = 'hub';
--   ALTER TABLE public.agency_domains
--     DROP CONSTRAINT IF EXISTS agency_domains_tenant_scope_check;
--   ALTER TABLE public.agency_domains
--     ADD CONSTRAINT agency_domains_tenant_scope_check
--     CHECK (
--       (kind IN ('subdomain','custom')       AND tenant_id IS NOT NULL)
--       OR (kind IN ('marketing','app','hub') AND tenant_id IS NULL)
--     );
-- COMMIT;
--
-- After this, migration 20260625100000's rollback can safely DELETE the hub
-- agency row.
