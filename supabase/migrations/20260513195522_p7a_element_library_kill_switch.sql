-- P7A-5 — Tenant feature flag / kill switch for the Element Library MVP.
--
-- Until now the Element Library has been plan-tier-only (derived from
-- agencies.plan_tier via isAdvancedElementLibraryEnabledForPlan). That's
-- correct as the default, but it gives the platform no way to:
--
--   1. Roll out 7A gradually (e.g. enable for 3 beta tenants on Agency
--      tier before the rest of the cohort)
--   2. Kill the feature for a specific tenant who hits a regression
--      without rolling back the deploy or downgrading their plan
--   3. Allow opt-in from a paid Studio tenant that wants to preview
--      Advanced Mode before paying for Agency
--
-- Solution: a per-tenant tri-state override on agency_entitlements.
--   NULL    → use the plan-tier default (current behavior)
--   TRUE    → force-enable regardless of plan
--   FALSE   → force-disable regardless of plan (the kill switch)
--
-- The resolver in element-library-policy.ts checks the override first;
-- when NULL it falls back to the plan-tier rule.

BEGIN;

ALTER TABLE public.agency_entitlements
  ADD COLUMN IF NOT EXISTS element_library_override BOOLEAN;

COMMENT ON COLUMN public.agency_entitlements.element_library_override IS
  'P7A-5 — Per-tenant override for the Element Library MVP. NULL = use plan-tier default. TRUE = force-enable (beta opt-in). FALSE = force-disable (kill switch / regression escape hatch).';

COMMIT;
