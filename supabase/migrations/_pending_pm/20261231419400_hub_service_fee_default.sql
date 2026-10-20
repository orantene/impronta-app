-- TUL-1366 (MONEY, PM approval required): the Tulala service fee is 1.5% on top,
-- customer-only, the DEFAULT for every plan and model; the rate is configurable
-- per plan and per workspace (for the later 3-5%).
--
-- Code ships first and is fail-soft: with these columns/keys absent every read
-- falls back to the platform rate (150 bps) and an 'included' row stays legacy.
-- Applying this file is what flips the live setting, so the PM applies it
-- (staging first). Rollback at the bottom.
--
-- 1. The setting itself: pass_through is now the default and the live row moves
--    to it (the env key is no longer needed; COMMISSION_PROCESSING_PASS_THROUGH=0
--    is the kill switch in code).
ALTER TABLE public.platform_commission_config
  ALTER COLUMN processing_mode SET DEFAULT 'pass_through';

UPDATE public.platform_commission_config
   SET processing_mode = 'pass_through',
       pass_through_take_bps = COALESCE(pass_through_take_bps, 150)
 WHERE singleton_key = TRUE
   AND (processing_mode IS DISTINCT FROM 'pass_through' OR pass_through_take_bps IS NULL);

-- 2. Per-plan rate: { "agency": 300, ... } in bps (0..1000). Empty = platform rate.
ALTER TABLE public.platform_commission_config
  ADD COLUMN IF NOT EXISTS plan_tier_pass_through_bps JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.platform_commission_config
  DROP CONSTRAINT IF EXISTS platform_commission_config_plan_tier_pt_bps_chk;
ALTER TABLE public.platform_commission_config
  ADD CONSTRAINT platform_commission_config_plan_tier_pt_bps_chk
    CHECK (jsonb_typeof(plan_tier_pass_through_bps) = 'object');
COMMENT ON COLUMN public.platform_commission_config.plan_tier_pass_through_bps IS
  'Service fee rate (bps, 0..1000) per workspace plan tier in pass_through mode. Empty object = every plan uses pass_through_take_bps (default 150 = 1.5%).';

-- 3. Per-workspace rate. NULL = no override.
ALTER TABLE public.workspace_commission_overrides
  ADD COLUMN IF NOT EXISTS pass_through_take_bps INT;
ALTER TABLE public.workspace_commission_overrides
  DROP CONSTRAINT IF EXISTS workspace_commission_overrides_pt_bps_chk;
ALTER TABLE public.workspace_commission_overrides
  ADD CONSTRAINT workspace_commission_overrides_pt_bps_chk
    CHECK (pass_through_take_bps IS NULL OR pass_through_take_bps BETWEEN 0 AND 1000);
COMMENT ON COLUMN public.workspace_commission_overrides.pass_through_take_bps IS
  'Per-workspace override of the customer-only service fee in bps (0..1000). 0 waives it. NULL = plan or platform rate.';

-- 4. The reader RPC also returns the per-plan map.
CREATE OR REPLACE FUNCTION public.engine_platform_processing_mode()
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'processing_mode', processing_mode,
    'pass_through_take_bps', pass_through_take_bps,
    'processor_fee_rates', processor_fee_rates,
    'plan_tier_pass_through_bps', plan_tier_pass_through_bps
  )
  FROM public.platform_commission_config
  WHERE singleton_key = TRUE;
$$;

-- Rollback (manual):
--   ALTER TABLE public.platform_commission_config ALTER COLUMN processing_mode SET DEFAULT 'included';
--   UPDATE public.platform_commission_config SET processing_mode = 'included' WHERE singleton_key = TRUE;
--   (columns and the extra RPC key are additive and harmless to leave)
