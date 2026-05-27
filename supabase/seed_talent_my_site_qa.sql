-- Talent My Site — local QA fixtures (Free / Pro / agency sitemap roster).
--
-- Run after core seeds + `npm run register:tulum-demo-talent` (links auth users).
-- Apply via: `cd web && npm run seed:talent-my-site-qa`
--
-- Accounts (password: Impronta-Tulum-Talent-2026! or TULUM_DEMO_TALENT_PASSWORD):
--   Free Flow A: tulum-talent-sofia@impronta.test  → TAL-92001 (talent_basic)
--   Pro Flow B:  tulum-talent-carmen@impronta.test → TAL-92002 (talent_pro)
--   Max Flow C:  qa-talent-dashboard-audit@impronta.test → TAL-AUDIT-0512 (talent_portfolio)
--
-- Agency sitemap (impronta.local): TAL-92001 + TAL-92002 get created_by_agency_id
-- for the Impronta demo tenant so /sitemap.xml lists /t/<code> roster URLs.

BEGIN;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.talent_profiles WHERE profile_code = 'TAL-92001' AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION
      'Missing TAL-92001 — apply supabase/seed_tulum_spanish_talent.sql and register:tulum-demo-talent first.';
  END IF;
END
$guard$;

UPDATE public.talent_profiles
SET
  talent_plan_key = 'talent_basic',
  created_by_agency_id = '00000000-0000-0000-0000-000000000001'::uuid,
  updated_at = now()
WHERE profile_code = 'TAL-92001'
  AND deleted_at IS NULL;

UPDATE public.talent_profiles
SET
  talent_plan_key = 'talent_pro',
  created_by_agency_id = '00000000-0000-0000-0000-000000000001'::uuid,
  updated_at = now()
WHERE profile_code = 'TAL-92002'
  AND deleted_at IS NULL;

UPDATE public.talent_profiles
SET
  talent_plan_key = 'talent_portfolio',
  created_by_agency_id = '00000000-0000-0000-0000-000000000001'::uuid,
  updated_at = now()
WHERE profile_code = 'TAL-AUDIT-0512'
  AND deleted_at IS NULL;

COMMIT;
