-- Promos v1 hotfix: no promo may go live on the shared hub tenant.
--
-- Promos are scoped to a tenant. Every hub talent shares ONE tenant (kind =
-- 'hub', ~300 talents), so a 20% "all services" promo created by one hub
-- talent would re-price every other hub talent's services. Found on prod right
-- after #3742 shipped (a QA promo on TAL-93900; 0 redemptions, archived).
--
-- Until promos carry the owning talent (follow-up), the database refuses a
-- live promo on a hub tenant. Drafts, paused and archived rows stay allowed so
-- nothing a talent typed is lost. Agency tenants are unaffected.

CREATE OR REPLACE FUNCTION public.tenant_promo_codes_block_hub_live()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT COALESCE(NEW.is_draft, false)
     AND NOT COALESCE(NEW.is_paused, false)
     AND NEW.archived_at IS NULL
     AND COALESCE(NEW.is_active, true)
     AND EXISTS (SELECT 1 FROM public.agencies a WHERE a.id = NEW.tenant_id AND a.kind = 'hub') THEN
    RAISE EXCEPTION 'promos_hub_tenant_blocked'
      USING HINT = 'A live promo on the shared hub tenant would apply to every hub talent.';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tenant_promo_codes_block_hub_live() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tenant_promo_codes_block_hub_live_trg ON public.tenant_promo_codes;
CREATE TRIGGER tenant_promo_codes_block_hub_live_trg
  BEFORE INSERT OR UPDATE ON public.tenant_promo_codes
  FOR EACH ROW EXECUTE FUNCTION public.tenant_promo_codes_block_hub_live();

DO $check$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tenant_promo_codes_block_hub_live_trg') THEN
    RAISE EXCEPTION 'hub promo guard trigger missing';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.tenant_promo_codes p JOIN public.agencies a ON a.id = p.tenant_id
     WHERE a.kind = 'hub' AND NOT p.is_draft AND NOT p.is_paused AND p.archived_at IS NULL AND p.is_active
  ) THEN
    RAISE EXCEPTION 'a live promo already exists on a hub tenant; pause it first';
  END IF;
END
$check$;
