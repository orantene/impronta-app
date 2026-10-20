-- TUL-1366 (MONEY, PM approval required): the Tulala service fee is 1.5% on top,
-- customer-only, the DEFAULT for every plan and model. It is NOT hard-coded:
-- Platform Admin sets the % per plan / membership level (Commerce > Catalog >
-- tier drawer), 0-20%, platform-admin only, audited.
--
-- Code ships first and is fail-soft: with these columns/keys absent every read
-- falls back to the platform rate (150 bps) and an 'included' row stays legacy.
-- Applying this file is what flips the live setting, so the PM applies it
-- (staging first). Rollback at the bottom.

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

-- 2. The fee per plan / membership level, next to where plan prices live.
--    Written ONLY by the platform-admin server action (service role). The table
--    has no public RLS policy and this migration adds none.
ALTER TABLE public.product_tiers
  ADD COLUMN IF NOT EXISTS service_fee_bps INT NOT NULL DEFAULT 150;
ALTER TABLE public.product_tiers
  DROP CONSTRAINT IF EXISTS product_tiers_service_fee_bps_chk;
ALTER TABLE public.product_tiers
  ADD CONSTRAINT product_tiers_service_fee_bps_chk CHECK (service_fee_bps BETWEEN 0 AND 2000);
COMMENT ON COLUMN public.product_tiers.service_fee_bps IS
  'Tulala service fee (basis points, 0..2000 = 0-20%) a customer pays on top of a booking sold by a seller on this plan. Default 150 = 1.5%. Read at quote time and snapshotted on the order (orders.service_fee_by_party).';

-- 3. The quote-time snapshot: { "<seller party id>": bps } frozen when the order
--    is priced, so a later fee change never changes a past or open order.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS service_fee_by_party JSONB;
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_service_fee_by_party_chk;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_service_fee_by_party_chk
    CHECK (service_fee_by_party IS NULL OR jsonb_typeof(service_fee_by_party) = 'object');
COMMENT ON COLUMN public.orders.service_fee_by_party IS
  'Frozen Tulala service fee in bps per seller party id, captured when the order was priced.';

-- 4. The reader RPC also returns the per-plan fee map, keyed by the RUNTIME plan
--    key (workspace: free/studio/agency/network; talent: talent_basic/talent_pro/
--    talent_portfolio), the same mapping pricing-cta-href.ts uses.
CREATE OR REPLACE FUNCTION public.engine_platform_processing_mode()
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'processing_mode', c.processing_mode,
    'pass_through_take_bps', c.pass_through_take_bps,
    'processor_fee_rates', c.processor_fee_rates,
    'plan_service_fee_bps', COALESCE((
      SELECT jsonb_object_agg(
               CASE
                 WHEN p.slug = 'workspace' AND t.slug = 'hub' THEN 'network'
                 WHEN p.slug = 'workspace' THEN t.slug
                 WHEN p.slug = 'talent' AND t.slug = 'free' THEN 'talent_basic'
                 WHEN p.slug = 'talent' AND t.slug = 'pro'  THEN 'talent_pro'
                 WHEN p.slug = 'talent' AND t.slug = 'max'  THEN 'talent_portfolio'
               END,
               t.service_fee_bps)
        FROM public.product_tiers t
        JOIN public.product_packages p ON p.id = t.package_id
       WHERE p.slug IN ('workspace', 'talent')
         AND (p.slug = 'workspace' OR t.slug IN ('free', 'pro', 'max'))
    ), '{}'::jsonb)
  )
  FROM public.platform_commission_config c
  WHERE c.singleton_key = TRUE;
$$;

-- Rollback (manual):
--   ALTER TABLE public.platform_commission_config ALTER COLUMN processing_mode SET DEFAULT 'included';
--   UPDATE public.platform_commission_config SET processing_mode = 'included' WHERE singleton_key = TRUE;
--   (the columns and the extra RPC key are additive and harmless to leave)
