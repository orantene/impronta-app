-- P4c plumbing — workspace base reservation fee.
--
-- A workspace can charge an automatic base reservation fee on every booking
-- (a flat amount and/or a % of subtotal). Workspace revenue, clamped to
-- platform caps. The resolver math already supports this (commission.ts,
-- P4c-core); this migration adds the config it reads + a SECURITY DEFINER
-- reader so the engine can surface it (the per-participant context RPC's
-- admin-only reads are bypassed the same way as the commission split).
--
-- No snapshot column / persist-RPC change is needed: the base fee flows into
-- the already-persisted workspace_fee_cents (workspace payout) and
-- gross_charged_cents (client charge), so it's collected + paid with no
-- changes to engine_persist_booking_commission_snapshot.

BEGIN;

-- ── Workspace's base fee (per-tenant, workspace-admin controlled) ───────────
ALTER TABLE public.workspace_commission_overrides
  ADD COLUMN IF NOT EXISTS base_reservation_fee_cents INT,
  ADD COLUMN IF NOT EXISTS base_reservation_fee_bps INT;

ALTER TABLE public.workspace_commission_overrides
  DROP CONSTRAINT IF EXISTS workspace_commission_overrides_base_fee_chk;
ALTER TABLE public.workspace_commission_overrides
  ADD CONSTRAINT workspace_commission_overrides_base_fee_chk CHECK (
    (base_reservation_fee_cents IS NULL OR base_reservation_fee_cents >= 0)
    AND (base_reservation_fee_bps IS NULL OR (base_reservation_fee_bps >= 0 AND base_reservation_fee_bps <= 5000))
  );

COMMENT ON COLUMN public.workspace_commission_overrides.base_reservation_fee_cents IS
  'Workspace automatic base reservation fee — flat amount in cents, charged on every booking (workspace revenue, clamped to platform max). NULL = none.';
COMMENT ON COLUMN public.workspace_commission_overrides.base_reservation_fee_bps IS
  'Workspace automatic base reservation fee — % of subtotal in bps. NULL = none. Combines additively with the flat amount.';

-- ── Platform caps (platform-admin controlled bounds) ────────────────────────
ALTER TABLE public.platform_commission_config
  ADD COLUMN IF NOT EXISTS max_base_fee_cents INT,
  ADD COLUMN IF NOT EXISTS max_base_fee_bps INT;

ALTER TABLE public.platform_commission_config
  DROP CONSTRAINT IF EXISTS platform_commission_config_max_base_fee_chk;
ALTER TABLE public.platform_commission_config
  ADD CONSTRAINT platform_commission_config_max_base_fee_chk CHECK (
    (max_base_fee_cents IS NULL OR max_base_fee_cents >= 0)
    AND (max_base_fee_bps IS NULL OR (max_base_fee_bps >= 0 AND max_base_fee_bps <= 5000))
  );

COMMENT ON COLUMN public.platform_commission_config.max_base_fee_cents IS
  'Platform cap on a workspace flat base reservation fee, in cents. NULL = uncapped.';
COMMENT ON COLUMN public.platform_commission_config.max_base_fee_bps IS
  'Platform cap on a workspace % base reservation fee, in bps. NULL = uncapped.';

-- ── Reader: surface the base-fee inputs to the commission engine ────────────
-- Returns the tenant's base fee (NULL if no override row) + the platform caps.
-- SECURITY DEFINER bypasses the admin-only read RLS, same as the split reader.
CREATE OR REPLACE FUNCTION public.engine_workspace_base_fee_inputs(p_tenant_id UUID)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'base_reservation_fee_cents',
      (SELECT base_reservation_fee_cents FROM public.workspace_commission_overrides WHERE tenant_id = p_tenant_id),
    'base_reservation_fee_bps',
      (SELECT base_reservation_fee_bps FROM public.workspace_commission_overrides WHERE tenant_id = p_tenant_id),
    'max_base_fee_cents',
      (SELECT max_base_fee_cents FROM public.platform_commission_config WHERE singleton_key = TRUE),
    'max_base_fee_bps',
      (SELECT max_base_fee_bps FROM public.platform_commission_config WHERE singleton_key = TRUE)
  );
$$;

REVOKE ALL ON FUNCTION public.engine_workspace_base_fee_inputs(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.engine_workspace_base_fee_inputs(UUID) TO authenticated;

COMMENT ON FUNCTION public.engine_workspace_base_fee_inputs(UUID) IS
  'Returns {base_reservation_fee_cents, base_reservation_fee_bps, max_base_fee_cents, max_base_fee_bps} for the commission engine to inject into the resolver. SECURITY DEFINER bypasses admin-only read RLS on platform_commission_config + workspace_commission_overrides.';

COMMIT;
