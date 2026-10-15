-- Promos v1: lift the emergency "no live promo on the hub tenant" block.
--
-- 20261231384500 / 20261231385500 refused every live promo on the shared hub
-- tenant because readers were tenant-scoped. This PR's code scopes every
-- reader and writer by talent_profile_id, and 20261231385000 already requires
-- an owner on every hub row. With both in place a hub talent's promo can only
-- price that talent, so the blanket block goes and creation works per talent.
--
-- ORDER: apply only after the owner-aware code (this PR) is live on prod.

DROP TRIGGER IF EXISTS tenant_promo_codes_block_hub_live_trg ON public.tenant_promo_codes;
DROP FUNCTION IF EXISTS public.tenant_promo_codes_block_hub_live();

DO $check$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tenant_promo_codes_block_hub_live_trg') THEN
    RAISE EXCEPTION 'hub live-block trigger still present';
  END IF;
  -- The owner rule must still stand, or lifting the block reopens the leak.
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tenant_promo_codes_require_hub_owner_trg') THEN
    RAISE EXCEPTION 'hub owner trigger missing; refusing to lift the live-block';
  END IF;
END
$check$;
