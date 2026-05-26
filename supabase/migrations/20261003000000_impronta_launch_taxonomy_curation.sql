-- Impronta launch taxonomy curation.
--
-- Keep the broad Tulala platform taxonomy intact, but narrow Impronta's
-- tenant-enabled leaf talent types to a launch-ready agency set. This is a
-- non-destructive tenant settings change only: taxonomy_terms and existing
-- talent assignments/media are untouched.

BEGIN;

WITH
tenant AS (
  SELECT id
  FROM public.agencies
  WHERE slug = 'impronta'
),
launch_keep(slug) AS (
  VALUES
    -- Models
    ('art-model'),
    ('beauty-model'),
    ('bridal-model'),
    ('campaign-model'),
    ('catalog-model'),
    ('commercial-fashion-model'),
    ('commercial-model'),
    ('e-commerce-model'),
    ('editorial-model'),
    ('event-model'),
    ('fashion-model'),
    ('fitness-model'),
    ('hair-model'),
    ('hand-model'),
    ('jewelry-model'),
    ('lifestyle-model'),
    ('mature-model'),
    ('petite-model'),
    ('plus-size-model'),
    ('product-model'),
    ('promotional-model'),
    ('runway-model'),
    ('showroom-model'),
    ('swimwear-model'),
    ('tattoo-model'),
    -- Hosts & promo
    ('beach-club-hostess'),
    ('brand-ambassador'),
    ('corporate-event-host'),
    ('event-hostess'),
    ('hostess'),
    ('luxury-brand-ambassador'),
    ('nightlife-host'),
    ('nightlife-hostess'),
    ('private-event-host'),
    ('promotional-ambassador'),
    ('restaurant-hostess'),
    ('trade-show-ambassador'),
    ('vip-guest-hostess'),
    ('vip-host'),
    ('wedding-host'),
    ('yacht-event-host'),
    -- Performers
    ('acrobat'),
    ('actor'),
    ('aerial-performer'),
    ('circus-performer'),
    ('dance-group'),
    ('dancer'),
    ('drag-performer'),
    ('entertainer'),
    ('fire-performer'),
    ('latin-dancer'),
    ('led-performer'),
    ('magician'),
    ('nightlife-dancer'),
    ('performer'),
    ('specialty-dancer'),
    ('stilt-walker'),
    ('variety-show-performer'),
    -- Music & DJs
    ('acoustic-singer'),
    ('beach-club-dj'),
    ('club-dj'),
    ('cover-band'),
    ('dj'),
    ('house-dj'),
    ('jazz-band'),
    ('jazz-singer'),
    ('latin-band'),
    ('latin-dj'),
    ('latin-singer'),
    ('live-band'),
    ('lounge-dj'),
    ('mariachi-band'),
    ('musician'),
    ('open-format-dj'),
    ('percussionist'),
    ('saxophonist'),
    ('singer'),
    ('violinist'),
    ('wedding-dj'),
    -- Influencers & creators
    ('beauty-influencer'),
    ('content-creator'),
    ('event-coverage-creator'),
    ('fashion-influencer'),
    ('instagram-creator'),
    ('influencer'),
    ('lifestyle-influencer'),
    ('luxury-influencer'),
    ('product-review-creator'),
    ('restaurant-hotel-promo-creator'),
    ('short-form-video-creator'),
    ('sponsored-content-creator'),
    ('tiktok-creator'),
    ('travel-influencer'),
    ('ugc-creator'),
    ('youtube-creator'),
    -- Photo, video & creative
    ('art-director'),
    ('commercial-videographer'),
    ('creative-producer'),
    ('drone-photographer'),
    ('drone-pilot'),
    ('drone-videographer'),
    ('event-content-creator'),
    ('event-photographer'),
    ('event-videographer'),
    ('fashion-photographer'),
    ('fashion-stylist'),
    ('hotel-photographer'),
    ('nightlife-photographer'),
    ('portrait-photographer'),
    ('product-photographer'),
    ('retoucher'),
    ('shoot-producer'),
    ('stylist'),
    ('videographer'),
    -- Wellness & beauty
    ('bridal-beauty-artist'),
    ('brow-artist'),
    ('hair-stylist'),
    ('lash-artist'),
    ('makeup-artist'),
    ('makeup-hair-team'),
    ('massage-therapist'),
    ('nail-artist'),
    ('skincare-specialist'),
    ('spa-therapist'),
    ('wellness-retreat-host'),
    ('yoga-instructor'),
    -- Event staff
    ('check-in-staff'),
    ('event-assistant'),
    ('event-captain'),
    ('event-promoter'),
    ('event-supervisor'),
    ('greeter'),
    ('production-assistant'),
    ('registration-staff'),
    ('runner'),
    ('sampling-staff'),
    ('server'),
    ('setup-crew'),
    ('stagehand'),
    ('usher')
),
enabled_parent AS (
  SELECT parent.id
  FROM public.taxonomy_terms parent
  CROSS JOIN tenant
  LEFT JOIN public.agency_taxonomy_settings parent_settings
    ON parent_settings.tenant_id = tenant.id
   AND parent_settings.taxonomy_term_id = parent.id
  WHERE parent.term_type = 'parent_category'
    AND parent.is_active = true
    AND parent.archived_at IS NULL
    AND COALESCE(parent_settings.is_enabled, true) = true
),
candidate_groups AS (
  SELECT grp.id
  FROM public.taxonomy_terms grp
  JOIN enabled_parent parent
    ON parent.id = grp.parent_id
  WHERE grp.term_type = 'category_group'
    AND grp.is_active = true
    AND grp.archived_at IS NULL
),
candidate_leaves AS (
  SELECT leaf.id, leaf.slug, leaf.parent_id
  FROM public.taxonomy_terms leaf
  JOIN candidate_groups grp
    ON grp.id = leaf.parent_id
  WHERE leaf.term_type = 'talent_type'
    AND leaf.is_active = true
    AND leaf.archived_at IS NULL
),
kept_leaves AS (
  SELECT leaf.*
  FROM candidate_leaves leaf
  JOIN launch_keep keep
    ON keep.slug = leaf.slug
),
kept_groups AS (
  SELECT DISTINCT parent_id AS id
  FROM kept_leaves
),
group_settings AS (
  INSERT INTO public.agency_taxonomy_settings (
    tenant_id,
    taxonomy_term_id,
    is_enabled,
    show_in_registration,
    show_in_directory,
    updated_at
  )
  SELECT
    tenant.id,
    grp.id,
    kept_groups.id IS NOT NULL,
    kept_groups.id IS NOT NULL,
    kept_groups.id IS NOT NULL,
    now()
  FROM candidate_groups grp
  CROSS JOIN tenant
  LEFT JOIN kept_groups
    ON kept_groups.id = grp.id
  ON CONFLICT (tenant_id, taxonomy_term_id)
  DO UPDATE SET
    is_enabled = EXCLUDED.is_enabled,
    show_in_registration = EXCLUDED.show_in_registration,
    show_in_directory = EXCLUDED.show_in_directory,
    updated_at = EXCLUDED.updated_at
  RETURNING taxonomy_term_id, is_enabled
),
leaf_settings AS (
  INSERT INTO public.agency_taxonomy_settings (
    tenant_id,
    taxonomy_term_id,
    is_enabled,
    show_in_registration,
    show_in_directory,
    allow_as_primary,
    allow_as_secondary,
    updated_at
  )
  SELECT
    tenant.id,
    leaf.id,
    keep.slug IS NOT NULL,
    keep.slug IS NOT NULL,
    keep.slug IS NOT NULL,
    keep.slug IS NOT NULL,
    keep.slug IS NOT NULL,
    now()
  FROM candidate_leaves leaf
  CROSS JOIN tenant
  LEFT JOIN launch_keep keep
    ON keep.slug = leaf.slug
  ON CONFLICT (tenant_id, taxonomy_term_id)
  DO UPDATE SET
    is_enabled = EXCLUDED.is_enabled,
    show_in_registration = EXCLUDED.show_in_registration,
    show_in_directory = EXCLUDED.show_in_directory,
    allow_as_primary = EXCLUDED.allow_as_primary,
    allow_as_secondary = EXCLUDED.allow_as_secondary,
    updated_at = EXCLUDED.updated_at
  RETURNING taxonomy_term_id, is_enabled
)
INSERT INTO public.engine_audit_log (
  tenant_id,
  actor_user_id,
  actor_role,
  surface,
  subject_kind,
  subject_id,
  subject_key,
  operation,
  before_value,
  after_value
)
SELECT
  tenant.id,
  NULL,
  'system_migration',
  'taxonomy',
  'tenant_taxonomy_curation',
  tenant.id,
  'impronta-launch-taxonomy-v1',
  'set',
  NULL,
  jsonb_build_object(
    'enabled_leaf_count', (SELECT count(*) FROM leaf_settings WHERE is_enabled),
    'disabled_leaf_count', (SELECT count(*) FROM leaf_settings WHERE NOT is_enabled),
    'enabled_group_count', (SELECT count(*) FROM group_settings WHERE is_enabled),
    'disabled_group_count', (SELECT count(*) FROM group_settings WHERE NOT is_enabled),
    'non_destructive', true,
    'media_touched', false
  )
FROM tenant;

COMMIT;
