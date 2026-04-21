-- Widen saas_marketing_signups.tier_interest to include the new "studio" tier.
--
-- Context: the marketing pricing ladder now has four tiers (Free / Studio /
-- Agency / Network) instead of three. The form's ?tier= hint feeds
-- tier_interest, so the CHECK constraint needs to accept 'studio' alongside
-- the existing values.

BEGIN;

-- Drop the auto-named CHECK constraint on tier_interest regardless of how
-- Postgres named it, then recreate with the widened set.
DO $$
DECLARE
  cname TEXT;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'public.saas_marketing_signups'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%tier_interest%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.saas_marketing_signups DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE public.saas_marketing_signups
  ADD CONSTRAINT saas_marketing_signups_tier_interest_check
  CHECK (tier_interest IS NULL
         OR tier_interest IN ('free','studio','agency','network'));

COMMIT;
