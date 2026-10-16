-- Promos v1: every talent promo belongs to its talent.
--
-- Promos were scoped by tenant only. All hub talents (~300) share ONE tenant
-- (agencies.kind = 'hub'), so one hub talent's promo re-priced every other hub
-- talent. 20261231384500 refused live hub promos as an emergency guard; this
-- migration adds the owner and replaces that guard with the real rule:
--
--   * tenant_promo_codes.talent_profile_id = the talent that owns the promo.
--   * On a hub tenant the owner is REQUIRED (any status, live or not).
--   * On an agency tenant NULL means an agency-wide promo (admin discounts).
--
-- Additive: one nullable column, one index, one trigger swap, one backfill of
-- hub rows whose creator maps to exactly one talent profile.

ALTER TABLE public.tenant_promo_codes
  ADD COLUMN IF NOT EXISTS talent_profile_id uuid NULL
    REFERENCES public.talent_profiles(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS tenant_promo_codes_tenant_owner_idx
  ON public.tenant_promo_codes (tenant_id, talent_profile_id);

-- Backfill existing hub rows (drafts / paused / archived only; the 384500
-- guard kept them non-live) from created_by when it maps to exactly one
-- live talent profile. Unresolvable rows stay NULL: every reader filters by
-- owner, so they are invisible, and the trigger below refuses any write to
-- them until an owner is set.
UPDATE public.tenant_promo_codes p
   SET talent_profile_id = tp.id
  FROM public.agencies a, public.talent_profiles tp
 WHERE a.id = p.tenant_id
   AND a.kind = 'hub'
   AND p.talent_profile_id IS NULL
   AND p.created_by IS NOT NULL
   AND tp.user_id = p.created_by
   AND tp.deleted_at IS NULL
   AND (SELECT count(*) FROM public.talent_profiles t2
         WHERE t2.user_id = p.created_by AND t2.deleted_at IS NULL) = 1;

-- Replace the emergency guard.
DROP TRIGGER IF EXISTS tenant_promo_codes_block_hub_live_trg ON public.tenant_promo_codes;
DROP FUNCTION IF EXISTS public.tenant_promo_codes_block_hub_live();

CREATE OR REPLACE FUNCTION public.tenant_promo_codes_require_hub_owner()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.talent_profile_id IS NULL
     AND EXISTS (SELECT 1 FROM public.agencies a WHERE a.id = NEW.tenant_id AND a.kind = 'hub') THEN
    RAISE EXCEPTION 'promos_hub_owner_required'
      USING HINT = 'A promo on the shared hub tenant must name its talent (talent_profile_id).';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tenant_promo_codes_require_hub_owner() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tenant_promo_codes_require_hub_owner_trg ON public.tenant_promo_codes;
CREATE TRIGGER tenant_promo_codes_require_hub_owner_trg
  BEFORE INSERT OR UPDATE ON public.tenant_promo_codes
  FOR EACH ROW EXECUTE FUNCTION public.tenant_promo_codes_require_hub_owner();

-- Assert the shape took.
DO $check$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'tenant_promo_codes' AND column_name = 'talent_profile_id'
  ) THEN
    RAISE EXCEPTION 'tenant_promo_codes.talent_profile_id missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tenant_promo_codes_require_hub_owner_trg') THEN
    RAISE EXCEPTION 'hub promo owner trigger missing';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tenant_promo_codes_block_hub_live_trg') THEN
    RAISE EXCEPTION 'old hub live-block trigger still present';
  END IF;
  IF has_function_privilege('anon', 'public.tenant_promo_codes_require_hub_owner()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.tenant_promo_codes_require_hub_owner()', 'EXECUTE') THEN
    RAISE EXCEPTION 'tenant_promo_codes_require_hub_owner is executable by anon/authenticated; the REVOKE did not take';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.tenant_promo_codes p JOIN public.agencies a ON a.id = p.tenant_id
     WHERE a.kind = 'hub' AND p.talent_profile_id IS NULL
       AND NOT p.is_draft AND NOT p.is_paused AND p.archived_at IS NULL AND p.is_active
  ) THEN
    RAISE EXCEPTION 'a live hub promo has no owner; pause it first';
  END IF;
END
$check$;
