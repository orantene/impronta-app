-- Free fixture taxonomy cleanup.
--
-- Morena Studio and QA Free Studio were old pre-cap fixtures with every
-- platform parent category enabled. Keep them as Free tenants but align them
-- with the current Free launch default: Models, Hosts & Promo, Creators.
-- This only writes tenant taxonomy settings; it never deletes taxonomy terms,
-- profiles, field values, or media.

BEGIN;

WITH target_tenants AS (
  SELECT id, slug
  FROM public.agencies
  WHERE slug IN ('morena-studio', 'qa-free-studio')
    AND lower(coalesce(plan_tier::text, '')) = 'free'
),
free_parent_default(slug) AS (
  VALUES
    ('models'),
    ('hosts-promo'),
    ('influencers-creators')
),
parent_settings AS (
  INSERT INTO public.agency_taxonomy_settings (
    tenant_id,
    taxonomy_term_id,
    is_enabled,
    show_in_registration,
    show_in_directory,
    allow_as_primary,
    allow_as_secondary,
    requires_approval,
    display_order,
    updated_at
  )
  SELECT
    tt.id,
    term.id,
    keep.slug IS NOT NULL,
    keep.slug IS NOT NULL,
    keep.slug IS NOT NULL,
    keep.slug IS NOT NULL,
    keep.slug IS NOT NULL,
    false,
    term.sort_order,
    now()
  FROM target_tenants tt
  CROSS JOIN public.taxonomy_terms term
  LEFT JOIN free_parent_default keep
    ON keep.slug = term.slug
  WHERE term.term_type = 'parent_category'
  ON CONFLICT (tenant_id, taxonomy_term_id)
  DO UPDATE SET
    is_enabled = EXCLUDED.is_enabled,
    show_in_registration = EXCLUDED.show_in_registration,
    show_in_directory = EXCLUDED.show_in_directory,
    allow_as_primary = EXCLUDED.allow_as_primary,
    allow_as_secondary = EXCLUDED.allow_as_secondary,
    display_order = EXCLUDED.display_order,
    updated_at = EXCLUDED.updated_at
  RETURNING tenant_id, taxonomy_term_id, is_enabled
),
descendant_settings AS (
  INSERT INTO public.agency_taxonomy_settings (
    tenant_id,
    taxonomy_term_id,
    is_enabled,
    show_in_registration,
    show_in_directory,
    allow_as_primary,
    allow_as_secondary,
    requires_approval,
    display_order,
    updated_at
  )
  SELECT
    tt.id,
    child.id,
    keep.slug IS NOT NULL,
    keep.slug IS NOT NULL,
    keep.slug IS NOT NULL,
    child.term_type = 'talent_type' AND keep.slug IS NOT NULL,
    child.term_type = 'talent_type' AND keep.slug IS NOT NULL,
    false,
    child.sort_order,
    now()
  FROM target_tenants tt
  JOIN public.taxonomy_terms parent
    ON parent.term_type = 'parent_category'
  JOIN public.taxonomy_terms group_term
    ON group_term.parent_id = parent.id
  JOIN public.taxonomy_terms child
    ON child.id = group_term.id OR child.parent_id = group_term.id
  LEFT JOIN free_parent_default keep
    ON keep.slug = parent.slug
  WHERE child.term_type IN ('category_group', 'talent_type')
  ON CONFLICT (tenant_id, taxonomy_term_id)
  DO UPDATE SET
    is_enabled = EXCLUDED.is_enabled,
    show_in_registration = EXCLUDED.show_in_registration,
    show_in_directory = EXCLUDED.show_in_directory,
    allow_as_primary = EXCLUDED.allow_as_primary,
    allow_as_secondary = EXCLUDED.allow_as_secondary,
    display_order = EXCLUDED.display_order,
    updated_at = EXCLUDED.updated_at
  RETURNING tenant_id, taxonomy_term_id, is_enabled
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
  tt.id,
  NULL,
  'system_migration',
  'taxonomy',
  'tenant_taxonomy_plan_cap',
  tt.id,
  tt.slug,
  'set',
  NULL,
  jsonb_build_object(
    'plan_tier', 'free',
    'enabled_parent_slugs', ARRAY['models', 'hosts-promo', 'influencers-creators'],
    'enabled_parent_count', (
      SELECT count(*)
      FROM parent_settings ps
      WHERE ps.tenant_id = tt.id AND ps.is_enabled
    ),
    'disabled_parent_count', (
      SELECT count(*)
      FROM parent_settings ps
      WHERE ps.tenant_id = tt.id AND NOT ps.is_enabled
    ),
    'enabled_descendant_count', (
      SELECT count(*)
      FROM descendant_settings ds
      WHERE ds.tenant_id = tt.id AND ds.is_enabled
    ),
    'disabled_descendant_count', (
      SELECT count(*)
      FROM descendant_settings ds
      WHERE ds.tenant_id = tt.id AND NOT ds.is_enabled
    ),
    'non_destructive', true,
    'media_touched', false
  )
FROM target_tenants tt;

COMMIT;
