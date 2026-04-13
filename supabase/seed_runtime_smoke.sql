-- Runtime smoke-test seed for Impronta.
-- Run after all migrations on a non-production environment or with care.

BEGIN;

-- Public settings used by frontend checks.
INSERT INTO public.settings (key, value)
VALUES
  ('contact_email', '"bookings@impronta.test"'::jsonb),
  ('directory_public', 'true'::jsonb),
  ('inquiries_open', 'true'::jsonb),
  ('watermark_enabled', 'false'::jsonb)
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    updated_at = now();

-- Ensure baseline location exists.
INSERT INTO public.locations (
  country_code,
  city_slug,
  display_name_en,
  display_name_es
)
VALUES (
  'MX',
  'cancun',
  'Cancun',
  'Cancun'
)
ON CONFLICT (country_code, city_slug) DO UPDATE
SET display_name_en = EXCLUDED.display_name_en,
    display_name_es = EXCLUDED.display_name_es,
    updated_at = now();

-- Featured public profile for homepage, directory, and profile page.
INSERT INTO public.talent_profiles (
  profile_code,
  public_slug_part,
  display_name,
  first_name,
  last_name,
  short_bio,
  workflow_status,
  visibility,
  membership_tier,
  membership_status,
  is_featured,
  featured_level,
  featured_position,
  listing_started_at,
  profile_completeness_score,
  location_id,
  residence_country_id,
  residence_city_id,
  height_cm
)
SELECT
  'TAL-90001',
  'sofia-demo',
  'Sofia Demo',
  'Sofia',
  'Demo',
  'Sample approved profile for runtime validation of homepage, directory, and public profile routes.',
  'approved'::public.profile_workflow_status,
  'public'::public.visibility,
  'featured'::public.membership_tier,
  'active'::public.membership_status,
  TRUE,
  10,
  1,
  now(),
  92,
  l.id,
  COALESCE(l.country_id, c.id),
  l.id,
  178
FROM public.locations l
LEFT JOIN public.countries c
  ON c.iso2 = upper(l.country_code)
 AND c.archived_at IS NULL
WHERE l.country_code = 'MX'
  AND l.city_slug = 'cancun'
ON CONFLICT (profile_code) DO UPDATE
SET public_slug_part = EXCLUDED.public_slug_part,
    display_name = EXCLUDED.display_name,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    short_bio = EXCLUDED.short_bio,
    workflow_status = EXCLUDED.workflow_status,
    visibility = EXCLUDED.visibility,
    membership_tier = EXCLUDED.membership_tier,
    membership_status = EXCLUDED.membership_status,
    is_featured = EXCLUDED.is_featured,
    featured_level = EXCLUDED.featured_level,
    featured_position = EXCLUDED.featured_position,
    listing_started_at = EXCLUDED.listing_started_at,
    profile_completeness_score = EXCLUDED.profile_completeness_score,
    location_id = EXCLUDED.location_id,
    residence_country_id = EXCLUDED.residence_country_id,
    residence_city_id = EXCLUDED.residence_city_id,
    height_cm = EXCLUDED.height_cm,
    updated_at = now();

-- Taxonomy assignments expected by homepage/directory/profile rendering.
INSERT INTO public.talent_profile_taxonomy (
  talent_profile_id,
  taxonomy_term_id,
  is_primary
)
SELECT tp.id, tt.id, TRUE
FROM public.talent_profiles tp
JOIN public.taxonomy_terms tt
  ON tt.kind = 'talent_type'
 AND tt.slug = 'model'
WHERE tp.profile_code = 'TAL-90001'
ON CONFLICT (talent_profile_id, taxonomy_term_id) DO UPDATE
SET is_primary = EXCLUDED.is_primary;

INSERT INTO public.talent_profile_taxonomy (
  talent_profile_id,
  taxonomy_term_id,
  is_primary
)
SELECT tp.id, tt.id, FALSE
FROM public.talent_profiles tp
JOIN public.taxonomy_terms tt
  ON tt.kind = 'fit_label'
 AND tt.slug = 'best-for-luxury-activations'
WHERE tp.profile_code = 'TAL-90001'
ON CONFLICT (talent_profile_id, taxonomy_term_id) DO NOTHING;

INSERT INTO public.talent_profile_taxonomy (
  talent_profile_id,
  taxonomy_term_id,
  is_primary
)
SELECT tp.id, tt.id, FALSE
FROM public.talent_profiles tp
JOIN public.taxonomy_terms tt
  ON tt.kind = 'language'
 AND tt.slug IN ('en', 'es')
WHERE tp.profile_code = 'TAL-90001'
ON CONFLICT (talent_profile_id, taxonomy_term_id) DO NOTHING;

COMMIT;
