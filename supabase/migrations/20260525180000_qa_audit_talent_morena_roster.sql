-- QA: multi-agency "My pages" smoke for qa-talent-dashboard-audit@impronta.test
-- (Impronta Models + Morena Studio). Idempotent.

BEGIN;

INSERT INTO public.agency_talent_roster (
  tenant_id,
  talent_profile_id,
  source_type,
  status,
  agency_visibility,
  hub_visibility_status,
  is_primary,
  added_at
)
SELECT
  'e886a518-d059-4a8b-a11d-273fc1d7da26'::UUID,
  'eb97dc64-af2b-4996-a48c-913a143cfa59'::UUID,
  'platform_assigned',
  'active',
  'site_visible',
  'not_submitted',
  FALSE,
  now()
WHERE EXISTS (
  SELECT 1 FROM public.talent_profiles WHERE id = 'eb97dc64-af2b-4996-a48c-913a143cfa59'::UUID
)
AND EXISTS (
  SELECT 1 FROM public.agencies WHERE id = 'e886a518-d059-4a8b-a11d-273fc1d7da26'::UUID
)
AND NOT EXISTS (
  SELECT 1
  FROM public.agency_talent_roster r
  WHERE r.tenant_id = 'e886a518-d059-4a8b-a11d-273fc1d7da26'::UUID
    AND r.talent_profile_id = 'eb97dc64-af2b-4996-a48c-913a143cfa59'::UUID
    AND r.status <> 'removed'
);

COMMIT;
