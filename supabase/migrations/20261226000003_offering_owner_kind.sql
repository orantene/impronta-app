-- Menu Phase 1: talent_offerings supports workspace-owned (menu) rows.
-- owner_kind exclusivity: talent rows keep a talent_profile_id; workspace rows
-- require tenant_id and null talent_profile_id. Staff SELECT via is_staff_of_tenant
-- because existing owner_read policies resolve through talent_profiles.user_id.

BEGIN;

-- 1. Nullable talent_profile_id (workspace rows have none).
ALTER TABLE public.talent_offerings
  ALTER COLUMN talent_profile_id DROP NOT NULL;

-- 2. owner_kind + exclusivity.
ALTER TABLE public.talent_offerings
  ADD COLUMN IF NOT EXISTS owner_kind text NOT NULL DEFAULT 'talent';

ALTER TABLE public.talent_offerings
  DROP CONSTRAINT IF EXISTS talent_offerings_owner_kind_check;

ALTER TABLE public.talent_offerings
  ADD CONSTRAINT talent_offerings_owner_kind_check
  CHECK (owner_kind IN ('talent', 'workspace'));

ALTER TABLE public.talent_offerings
  DROP CONSTRAINT IF EXISTS talent_offerings_owner_exclusivity;

ALTER TABLE public.talent_offerings
  ADD CONSTRAINT talent_offerings_owner_exclusivity
  CHECK (
    (owner_kind = 'talent'
      AND talent_profile_id IS NOT NULL)
    OR (owner_kind = 'workspace'
      AND talent_profile_id IS NULL
      AND tenant_id IS NOT NULL)
  );

COMMENT ON COLUMN public.talent_offerings.owner_kind IS
  'talent = roster profile catalogue; workspace = Menu (business-owned). Never branch money logic on a display label.';

CREATE INDEX IF NOT EXISTS idx_talent_offerings_workspace_menu
  ON public.talent_offerings (tenant_id, status, sort_order)
  WHERE owner_kind = 'workspace';

-- 3. tenant_id FK: SET NULL would violate exclusivity on workspace rows.
--    Drop and recreate as CASCADE. Constraint name may vary; find it dynamically.
DO $$
DECLARE
  v_conname text;
BEGIN
  SELECT c.conname INTO v_conname
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  WHERE t.relname = 'talent_offerings'
    AND c.contype = 'f'
    AND pg_get_constraintdef(c.oid) ILIKE '%tenant_id%agencies%';

  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.talent_offerings DROP CONSTRAINT %I', v_conname);
  END IF;

  ALTER TABLE public.talent_offerings
    ADD CONSTRAINT talent_offerings_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES public.agencies(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 4. Staff SELECT on offerings + children (writes stay service-role).
DROP POLICY IF EXISTS talent_offerings_staff_read ON public.talent_offerings;
CREATE POLICY talent_offerings_staff_read ON public.talent_offerings
  FOR SELECT USING (
    tenant_id IS NOT NULL
    AND public.is_staff_of_tenant(tenant_id)
  );

DROP POLICY IF EXISTS talent_offering_media_staff_read ON public.talent_offering_media;
CREATE POLICY talent_offering_media_staff_read ON public.talent_offering_media
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.talent_offerings o
      WHERE o.id = offering_id
        AND o.tenant_id IS NOT NULL
        AND public.is_staff_of_tenant(o.tenant_id)
    )
  );

-- Variants / addons (created in 20260709051219). Policies are no-ops if tables absent.
DO $$
BEGIN
  IF to_regclass('public.talent_offering_variants') IS NOT NULL THEN
    EXECUTE $p$
      DROP POLICY IF EXISTS offering_variants_staff_read ON public.talent_offering_variants;
      CREATE POLICY offering_variants_staff_read ON public.talent_offering_variants
        FOR SELECT USING (
          EXISTS (
            SELECT 1 FROM public.talent_offerings o
            WHERE o.id = offering_id
              AND o.tenant_id IS NOT NULL
              AND public.is_staff_of_tenant(o.tenant_id)
          )
        );
    $p$;
  END IF;

  IF to_regclass('public.talent_offering_addons') IS NOT NULL THEN
    EXECUTE $p$
      DROP POLICY IF EXISTS offering_addons_staff_read ON public.talent_offering_addons;
      CREATE POLICY offering_addons_staff_read ON public.talent_offering_addons
        FOR SELECT USING (
          EXISTS (
            SELECT 1 FROM public.talent_offerings o
            WHERE o.id = offering_id
              AND o.tenant_id IS NOT NULL
              AND public.is_staff_of_tenant(o.tenant_id)
          )
        );
    $p$;
  END IF;
END $$;

COMMIT;
