-- L50 / Phase 4 — compare-table support for product_features.
--
-- Additive only:
--   1. Add `value_text` column. When set, the compare-table cell shows
--      this string (e.g., "Up to 50", "Full + white-label"); when null,
--      the cell shows ✓ / — based on `included`.
--   2. Seed the compare-table-shaped rows that mirror the previously
--      hard-coded SECTIONS in `web/src/app/(marketing)/pricing/page.tsx`.
--      Categories ('pipeline' / 'notifications' / 'roster_site' /
--      'media' / 'team_access' / 'network_data') become section
--      headings on the rendered table.
--
-- Existing `category = 'core'` rows continue to power the highlight
-- chips on PlanCards + the get-started ladder. The compare-table
-- reader filters them out so they don't double-render.
--
-- Safe to apply against production: nullable column, INSERTs guarded
-- by NOT EXISTS so re-runs are no-ops.

ALTER TABLE public.product_features
  ADD COLUMN IF NOT EXISTS value_text TEXT;

-- ============================================================================
-- Compare-table seed — pulled VERBATIM from the prior SECTIONS const.
-- 4-tuple per row is (free, studio, agency, hub). NULL value_text +
-- included=TRUE → ✓.   NULL value_text + included=FALSE → —.   Set
-- value_text → string cell.
-- ============================================================================

WITH workspace_tiers AS (
  SELECT t.id, t.slug
  FROM public.product_tiers t
  JOIN public.product_packages p ON p.id = t.package_id
  WHERE p.slug = 'workspace'
),
seed_rows AS (
  SELECT * FROM (VALUES
    -- (label, category, display_order, free_inc, free_text, studio_inc, studio_text, agency_inc, agency_text, hub_inc, hub_text)
    ('Structured inquiry inbox',             'pipeline',    1, true, NULL, true, NULL, true, NULL, true, NULL),
    ('Versioned offers',                      'pipeline',    2, true, NULL, true, NULL, true, NULL, true, NULL),
    ('Multi-party approvals',                 'pipeline',    3, true, NULL, true, NULL, true, NULL, true, NULL),
    ('Booking conversion + calendar data',    'pipeline',    4, true, NULL, true, NULL, true, NULL, true, NULL),

    ('Email notifications',                   'notifications', 1, true, NULL, true, NULL, true, NULL, true, NULL),
    ('In-app notifications',                  'notifications', 2, true, NULL, true, NULL, true, NULL, true, NULL),
    ('Inquiry message threads',               'notifications', 3, true, NULL, true, NULL, true, NULL, true, NULL),
    ('WhatsApp inquiry notifications',        'notifications', 4, false, NULL, true, NULL, true, NULL, true, NULL),
    ('Priority email routing',                'notifications', 5, false, NULL, true, NULL, true, NULL, true, NULL),

    ('Free subdomain',                        'roster_site', 1, true, NULL, true, NULL, true, NULL, true, NULL),
    ('Custom domain',                         'roster_site', 2, false, NULL, false, NULL, true, NULL, true, NULL),
    ('Branded identity & design system',      'roster_site', 3, true, 'Basic', true, 'Basic', true, 'Full', true, 'Full + white-label'),
    ('People profiles',                       'roster_site', 4, true, 'Up to 10', true, 'Up to 50', true, 'Unlimited', true, 'Unlimited'),
    ('CMS pages / posts / nav',               'roster_site', 5, false, NULL, false, NULL, true, NULL, true, NULL),
    ('Multi-locale',                          'roster_site', 6, false, NULL, false, NULL, true, NULL, true, NULL),

    ('Logo watermark on photos',              'media',       1, false, NULL, true, NULL, true, NULL, true, NULL),
    ('Watermark position, opacity & size',    'media',       2, false, NULL, true, NULL, true, NULL, true, NULL),
    ('Per-photo watermark override',          'media',       3, false, NULL, true, NULL, true, NULL, true, NULL),
    ('Workspace media gallery',               'media',       4, false, NULL, false, NULL, true, NULL, true, NULL),
    ('Photo usage tracking',                  'media',       5, false, NULL, false, NULL, true, NULL, true, NULL),
    ('Bulk watermark apply',                  'media',       6, false, NULL, false, NULL, true, NULL, true, NULL),
    ('Baked watermark exports (PDF / lookbook)', 'media',    7, false, NULL, true, NULL, true, NULL, true, NULL),

    ('Seats',                                 'team_access', 1, true, '1', true, 'Up to 3', true, 'Up to 8', true, 'Unlimited'),
    ('Roles & permissions',                   'team_access', 2, false, NULL, true, 'Basic', true, 'Built-in', true, 'Advanced + custom'),
    ('SSO (SAML, Google, Okta)',              'team_access', 3, false, NULL, false, NULL, false, NULL, true, 'On request'),
    ('Audit log',                             'team_access', 4, false, NULL, true, '30 days', true, '90 days', true, 'Full history'),

    ('Shared hub discovery (opt-in)',         'network_data', 1, true, NULL, true, NULL, true, NULL, true, NULL),
    ('Analytics & funnels',                   'network_data', 2, true, 'Basic', true, 'Basic', true, 'Full', true, 'Full + export API'),
    ('Data export',                           'network_data', 3, true, 'CSV', true, 'CSV', true, 'CSV + JSON', true, 'API access'),
    ('Priority onboarding',                   'network_data', 4, false, NULL, false, NULL, false, NULL, true, NULL)
  ) AS v(label, category, display_order,
         free_inc,   free_text,
         studio_inc, studio_text,
         agency_inc, agency_text,
         hub_inc,    hub_text)
)
INSERT INTO public.product_features (
  tier_id, label, included, highlight, display_order, category, value_text
)
SELECT
  wt.id, s.label,
  CASE wt.slug
    WHEN 'free'   THEN s.free_inc
    WHEN 'studio' THEN s.studio_inc
    WHEN 'agency' THEN s.agency_inc
    WHEN 'hub'    THEN s.hub_inc
  END AS included,
  false AS highlight,
  s.display_order,
  s.category,
  CASE wt.slug
    WHEN 'free'   THEN s.free_text
    WHEN 'studio' THEN s.studio_text
    WHEN 'agency' THEN s.agency_text
    WHEN 'hub'    THEN s.hub_text
  END AS value_text
FROM seed_rows s
CROSS JOIN workspace_tiers wt
WHERE wt.slug IN ('free', 'studio', 'agency', 'hub')
  AND NOT EXISTS (
    SELECT 1 FROM public.product_features pf
    WHERE pf.tier_id = wt.id
      AND pf.label = s.label
      AND pf.category = s.category
  );
