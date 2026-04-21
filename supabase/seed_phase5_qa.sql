-- ===========================================================================
-- Phase 5 QA harness — tenant + storefront fixture seed.
-- ===========================================================================
--
-- WHAT THIS IS
--   A bounded, CLEARLY-QA-ONLY seed that provisions one fixture tenant
--   (`qa-agency`) with enough Phase 5 data to walk through every M0..M6
--   surface end-to-end without touching live/demo/business data.
--
-- WHAT THIS IS NOT
--   Not product work. Not a migration. Not wired into the app boot path.
--   Nothing in here changes runtime behaviour for other tenants. Every
--   identifier is namespaced `qa-*` / `QA *` and every UUID starts with
--   `2222...` so they're unmistakable in admin lists, audit logs, and
--   hostname resolution.
--
-- HOW TO RUN
--   Pair this file with `scripts/seed-phase5-qa.mjs`:
--
--     npm --prefix web run seed:phase5-qa
--
--   The script runs this SQL over DATABASE_URL (bypassing RLS as the
--   `postgres` role), then provisions the 5 QA auth users + profiles +
--   memberships via the service-role key.
--
-- IDEMPOTENCY
--   Every INSERT uses ON CONFLICT DO UPDATE / DO NOTHING with stable PKs.
--   Re-running leaves data in the same state (including re-syncing the
--   `theme_json_draft` that exercises the design draft-vs-live scenario).
--
-- REMOVAL
--   To scrub the QA fixture entirely:
--     DELETE FROM public.agencies WHERE id = '22222222-2222-2222-2222-222222222222';
--   All child rows cascade (cms_pages, cms_sections, memberships, ...).
--   Auth users + profiles must be deleted via `scripts/seed-phase5-qa.mjs
--   --purge` (service-role key path; DB migrations can't touch auth.users).
--
-- SCENARIO MAP (what each fixture enables)
--   - Identity + localisation: see `agency_business_identity` row.
--   - Branding + design draft-vs-live: `agency_branding` has theme_json
--     (live, sparse) ≠ theme_json_draft (rich). M6 editor shows the delta.
--   - Branding rollback: `agency_branding_revisions` has 2 published +
--     1 draft snapshots to restore from.
--   - Navigation draft-vs-live: `cms_navigation_menus` (published) ≠
--     `cms_navigation_items` (draft) across 4 (zone, locale) tuples.
--   - Pages mix: system homepage EN + ES, published "about", draft
--     "upcoming-launch", archived "legacy-page".
--   - Page rollback: `cms_page_revisions` carries a prior snapshot of
--     the "about" page (different title + body).
--   - Sections mix: 3 published, 2 draft, 1 archived.
--   - Section rollback: `cms_section_revisions` for "Homepage hero (live)"
--     has a prior snapshot with a different headline.
--   - Homepage composition draft-vs-live: `cms_page_sections` links
--     homepage EN to HERO_LIVE (is_draft=FALSE) and HERO_ALT (is_draft=TRUE).
--     `published_homepage_snapshot` is frozen to HERO_LIVE's props so the
--     storefront keeps serving the snapshot until the next publish.
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Locked identifiers (clearly QA; copy-paste into verification queries).
-- ---------------------------------------------------------------------------
-- Tenant:   22222222-2222-2222-2222-222222222222   slug='qa-agency'
-- Sections: 22220001-0000-4000-8000-00000000000{1..5}
-- Pages:    22220002-0000-4000-8000-00000000001{e,f,0,1,2}  (e=home EN, f=home ES)
-- Revs:     22220003-0000-4000-8000-*
-- Nav:      22220004-0000-4000-8000-*
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. agencies — QA tenant row.
-- ---------------------------------------------------------------------------

INSERT INTO public.agencies (
  id, slug, display_name, status, template_key, supported_locales,
  onboarding_completed_at
)
VALUES (
  '22222222-2222-2222-2222-222222222222'::UUID,
  'qa-agency',
  'QA Agency (Phase 5 Fixture)',
  'active',
  'default',
  ARRAY['en','es']::TEXT[],
  now()
)
ON CONFLICT (id) DO UPDATE
  SET display_name      = EXCLUDED.display_name,
      status            = EXCLUDED.status,
      supported_locales = EXCLUDED.supported_locales,
      updated_at        = now();

-- ---------------------------------------------------------------------------
-- 2. agency_domains — QA subdomain for dev access.
-- ---------------------------------------------------------------------------
--
-- User-facing URL: http://qa-agency.local:4000
--
-- Add to /etc/hosts on the walkthrough machine:
--   127.0.0.1  qa-agency.local
--
-- The middleware fails hard on unregistered hostnames, so this row is the
-- gate that makes the QA storefront reachable at all.

INSERT INTO public.agency_domains (
  id, tenant_id, hostname, kind, is_primary, status,
  verified_at, ssl_provisioned_at
)
VALUES (
  '22220005-0000-4000-8000-000000000001'::UUID,
  '22222222-2222-2222-2222-222222222222'::UUID,
  'qa-agency.local',
  'subdomain',
  TRUE,
  'active',
  now(),
  NULL
)
ON CONFLICT (hostname) DO UPDATE
  SET tenant_id   = EXCLUDED.tenant_id,
      kind        = EXCLUDED.kind,
      is_primary  = EXCLUDED.is_primary,
      status      = EXCLUDED.status,
      verified_at = COALESCE(public.agency_domains.verified_at, EXCLUDED.verified_at),
      updated_at  = now();

-- ---------------------------------------------------------------------------
-- 3. agency_business_identity — M1 identity row.
-- ---------------------------------------------------------------------------

INSERT INTO public.agency_business_identity (
  tenant_id,
  public_name, legal_name, tagline, footer_tagline,
  contact_email, contact_phone, whatsapp,
  address_city, address_country, service_area,
  social_instagram, social_tiktok, social_facebook,
  social_linkedin, social_youtube, social_x,
  default_locale, supported_locales,
  seo_default_title, seo_default_description,
  primary_cta_label, primary_cta_href,
  version
)
VALUES (
  '22222222-2222-2222-2222-222222222222'::UUID,
  'QA Agency',
  'QA Agency LLC (fixture)',
  'Phase 5 walkthrough fixture — safe to edit.',
  'QA Agency · Phase 5 walkthrough',
  'qa-p5-agency-admin@impronta.test',
  '+1 555 000 0000',
  '+1 555 000 0000',
  'Tulum',
  'Mexico',
  'LATAM',
  'qa_agency_ig',
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  'en',
  ARRAY['en','es']::TEXT[],
  'QA Agency — Models & Talent (fixture)',
  'Fixture storefront for Phase 5 QA. Do not link to this from production surfaces.',
  'Start a booking',
  '/contact',
  1
)
ON CONFLICT (tenant_id) DO UPDATE
  SET public_name              = EXCLUDED.public_name,
      legal_name               = EXCLUDED.legal_name,
      tagline                  = EXCLUDED.tagline,
      footer_tagline           = EXCLUDED.footer_tagline,
      contact_email            = EXCLUDED.contact_email,
      contact_phone            = EXCLUDED.contact_phone,
      whatsapp                 = EXCLUDED.whatsapp,
      address_city             = EXCLUDED.address_city,
      address_country          = EXCLUDED.address_country,
      service_area             = EXCLUDED.service_area,
      social_instagram         = EXCLUDED.social_instagram,
      default_locale           = EXCLUDED.default_locale,
      supported_locales        = EXCLUDED.supported_locales,
      seo_default_title        = EXCLUDED.seo_default_title,
      seo_default_description  = EXCLUDED.seo_default_description,
      primary_cta_label        = EXCLUDED.primary_cta_label,
      primary_cta_href         = EXCLUDED.primary_cta_href,
      updated_at               = now();

-- ---------------------------------------------------------------------------
-- 4. agency_branding — colors + token maps (draft ≠ live for M6 walkthrough).
-- ---------------------------------------------------------------------------
--
-- theme_json (LIVE)       — sparse; only color.primary published.
-- theme_json_draft (DRAFT) — rich; operator has pending changes to ship.
-- theme_published_at       — set so the "Last publish" label renders.

INSERT INTO public.agency_branding (
  tenant_id,
  primary_color, accent_color, neutral_color, secondary_color,
  logo_media_asset_id, logo_dark_media_asset_id, favicon_media_asset_id,
  og_image_media_asset_id,
  font_preset, heading_font, body_font,
  theme_json, theme_json_draft, theme_published_at,
  version
)
VALUES (
  '22222222-2222-2222-2222-222222222222'::UUID,
  '#336699',
  '#ff9944',
  '#222222',
  '#66aadd',
  NULL, NULL, NULL, NULL,
  'default', NULL, NULL,
  jsonb_build_object(
    'color.primary', '#336699'
  ),
  jsonb_build_object(
    'color.primary',   '#2244aa',
    'color.secondary', '#66aadd',
    'color.accent',    '#ff7733',
    'radius.base',     'lg',
    'typography.heading-preset', 'serif'
  ),
  now() - interval '2 days',
  2
)
ON CONFLICT (tenant_id) DO UPDATE
  SET primary_color       = EXCLUDED.primary_color,
      accent_color        = EXCLUDED.accent_color,
      neutral_color       = EXCLUDED.neutral_color,
      secondary_color     = EXCLUDED.secondary_color,
      font_preset         = EXCLUDED.font_preset,
      theme_json          = EXCLUDED.theme_json,
      theme_json_draft    = EXCLUDED.theme_json_draft,
      theme_published_at  = EXCLUDED.theme_published_at,
      version             = EXCLUDED.version,
      updated_at          = now();

-- agency_branding_revisions — historical snapshots used by the design
-- rollback UI. Two "published" + one "draft" so the list has distinct
-- kinds to restore from. Created_by left NULL — service-role seeds carry
-- no actor.

INSERT INTO public.agency_branding_revisions (
  id, tenant_id, version, snapshot, kind, created_at
)
VALUES
  ('22220003-0000-4000-8000-000000000001'::UUID,
   '22222222-2222-2222-2222-222222222222'::UUID,
   1,
   jsonb_build_object(
     'primary_color', '#000000',
     'theme_json',    jsonb_build_object('color.primary', '#000000')
   ),
   'published',
   now() - interval '14 days'),
  ('22220003-0000-4000-8000-000000000002'::UUID,
   '22222222-2222-2222-2222-222222222222'::UUID,
   2,
   jsonb_build_object(
     'primary_color', '#336699',
     'theme_json',    jsonb_build_object('color.primary', '#336699')
   ),
   'published',
   now() - interval '2 days'),
  ('22220003-0000-4000-8000-000000000003'::UUID,
   '22222222-2222-2222-2222-222222222222'::UUID,
   3,
   jsonb_build_object(
     'theme_json_draft', jsonb_build_object(
       'color.primary', '#2244aa',
       'color.accent',  '#ff7733'
     )
   ),
   'draft',
   now() - interval '1 hour')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5. cms_sections — per-tenant reusable section instances (M4 surface).
-- ---------------------------------------------------------------------------
--
-- Statuses distributed deliberately to exercise the Site Settings → Sections
-- filters and the homepage composer's "publishable vs draft-only" gating.

INSERT INTO public.cms_sections (
  id, tenant_id, section_type_key, name, props_jsonb,
  status, schema_version, version
)
VALUES
  ('22220001-0000-4000-8000-000000000001'::UUID,
   '22222222-2222-2222-2222-222222222222'::UUID,
   'hero',
   'Homepage hero (live)',
   jsonb_build_object(
     'headline',     'Welcome to QA Agency',
     'subheadline',  'Phase 5 walkthrough fixture — this copy is safe to edit.',
     'primaryCta',   jsonb_build_object('label', 'Start a booking', 'href', '/contact')
   ),
   'published',
   1,
   2),
  ('22220001-0000-4000-8000-000000000002'::UUID,
   '22222222-2222-2222-2222-222222222222'::UUID,
   'hero',
   'Homepage hero (alt concept)',
   jsonb_build_object(
     'headline',     'Book Tulum''s top models',
     'subheadline',  'Alternate hero concept, currently draft-only.',
     'primaryCta',   jsonb_build_object('label', 'Explore talent', 'href', '/directory')
   ),
   'draft',
   1,
   1),
  ('22220001-0000-4000-8000-000000000003'::UUID,
   '22222222-2222-2222-2222-222222222222'::UUID,
   'hero',
   'Homepage hero (legacy)',
   jsonb_build_object(
     'headline', 'Old campaign line',
     'subheadline', 'Archived — kept for rollback demos.'
   ),
   'archived',
   1,
   1),
  ('22220001-0000-4000-8000-000000000004'::UUID,
   '22222222-2222-2222-2222-222222222222'::UUID,
   'hero',
   'Sub-brand hero',
   jsonb_build_object(
     'headline',    'QA Agency · Events',
     'subheadline', 'Reusable across campaign pages.'
   ),
   'published',
   1,
   1),
  ('22220001-0000-4000-8000-000000000005'::UUID,
   '22222222-2222-2222-2222-222222222222'::UUID,
   'hero',
   'Launch promo hero',
   jsonb_build_object(
     'headline',    'Spring launch — QA draft',
     'subheadline', 'Drafted, never published.'
   ),
   'draft',
   1,
   1)
ON CONFLICT (id) DO UPDATE
  SET props_jsonb    = EXCLUDED.props_jsonb,
      status         = EXCLUDED.status,
      version        = EXCLUDED.version,
      updated_at     = now();

-- cms_section_revisions — prior snapshot for HERO_LIVE so rollback UI has
-- a target with a visibly different headline.

INSERT INTO public.cms_section_revisions (
  id, tenant_id, section_id, version, schema_version, kind, snapshot, created_at
)
VALUES
  ('22220003-0000-4000-8000-000000000011'::UUID,
   '22222222-2222-2222-2222-222222222222'::UUID,
   '22220001-0000-4000-8000-000000000001'::UUID,
   1,
   1,
   'published',
   jsonb_build_object(
     'name',           'Homepage hero (live)',
     'section_type_key','hero',
     'status',         'published',
     'schema_version', 1,
     'version',        1,
     'props_jsonb', jsonb_build_object(
       'headline',    'Welcome (v1)',
       'subheadline', 'First published copy.'
     )
   ),
   now() - interval '7 days'),
  ('22220003-0000-4000-8000-000000000012'::UUID,
   '22222222-2222-2222-2222-222222222222'::UUID,
   '22220001-0000-4000-8000-000000000001'::UUID,
   2,
   1,
   'published',
   jsonb_build_object(
     'name',            'Homepage hero (live)',
     'section_type_key','hero',
     'status',          'published',
     'schema_version',  1,
     'version',         2,
     'props_jsonb', jsonb_build_object(
       'headline',    'Welcome to QA Agency',
       'subheadline', 'Phase 5 walkthrough fixture — this copy is safe to edit.',
       'primaryCta',  jsonb_build_object('label', 'Start a booking', 'href', '/contact')
     )
   ),
   now() - interval '6 days')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 6. cms_pages — system homepages + 3 standard pages.
-- ---------------------------------------------------------------------------
--
-- System homepages get is_system_owned=TRUE + system_template_key='homepage'
-- so the system-ownership trigger locks slug/locale/template_key. Admin
-- surfaces treat them as non-deletable. Slug is '' per M5 convention.

INSERT INTO public.cms_pages (
  id, tenant_id, locale, slug, template_key, title, status,
  body, hero, meta_title, meta_description,
  is_system_owned, system_template_key, template_schema_version, version,
  published_at
)
VALUES
  ('22220002-0000-4000-8000-00000000000e'::UUID,
   '22222222-2222-2222-2222-222222222222'::UUID,
   'en', '', 'homepage',
   'QA Agency — Home',
   'published',
   '', '{}'::jsonb, NULL, NULL,
   TRUE, 'homepage', 1, 2,
   now() - interval '2 days'),
  ('22220002-0000-4000-8000-00000000000f'::UUID,
   '22222222-2222-2222-2222-222222222222'::UUID,
   'es', '', 'homepage',
   'QA Agencia — Inicio',
   'published',
   '', '{}'::jsonb, NULL, NULL,
   TRUE, 'homepage', 1, 1,
   now() - interval '2 days'),
  ('22220002-0000-4000-8000-000000000010'::UUID,
   '22222222-2222-2222-2222-222222222222'::UUID,
   'en', 'about', 'standard_page',
   'About QA Agency',
   'published',
   'About copy (v2). Safe to edit.',
   '{}'::jsonb,
   'About — QA Agency',
   'About page for the Phase 5 QA fixture.',
   FALSE, NULL, 1, 2,
   now() - interval '5 days'),
  ('22220002-0000-4000-8000-000000000011'::UUID,
   '22222222-2222-2222-2222-222222222222'::UUID,
   'en', 'upcoming-launch', 'standard_page',
   'Upcoming launch (draft)',
   'draft',
   'Draft body for an unpublished page.',
   '{}'::jsonb, NULL, NULL,
   FALSE, NULL, 1, 1,
   NULL),
  ('22220002-0000-4000-8000-000000000012'::UUID,
   '22222222-2222-2222-2222-222222222222'::UUID,
   'en', 'legacy-page', 'standard_page',
   'Legacy page',
   'archived',
   'Retired, kept for archived-list UI.',
   '{}'::jsonb, NULL, NULL,
   FALSE, NULL, 1, 3,
   now() - interval '30 days')
ON CONFLICT (id) DO UPDATE
  SET title            = EXCLUDED.title,
      status           = EXCLUDED.status,
      body             = EXCLUDED.body,
      meta_title       = EXCLUDED.meta_title,
      meta_description = EXCLUDED.meta_description,
      version          = EXCLUDED.version,
      published_at     = EXCLUDED.published_at,
      updated_at       = now();

-- cms_page_revisions — prior snapshot of "about" so the rollback UI
-- shows at least one restorable version with a different title/body.

INSERT INTO public.cms_page_revisions (
  id, tenant_id, page_id, kind, snapshot, version, template_schema_version, created_at
)
VALUES
  ('22220003-0000-4000-8000-000000000021'::UUID,
   '22222222-2222-2222-2222-222222222222'::UUID,
   '22220002-0000-4000-8000-000000000010'::UUID,
   'published',
   jsonb_build_object(
     'title',            'About QA Agency (v1)',
     'status',           'published',
     'template_key',     'standard_page',
     'body',             'First published about copy.',
     'meta_title',       NULL,
     'meta_description', NULL,
     'version',          1
   ),
   1,
   1,
   now() - interval '10 days'),
  ('22220003-0000-4000-8000-000000000022'::UUID,
   '22222222-2222-2222-2222-222222222222'::UUID,
   '22220002-0000-4000-8000-000000000010'::UUID,
   'published',
   jsonb_build_object(
     'title',            'About QA Agency',
     'status',           'published',
     'template_key',     'standard_page',
     'body',             'About copy (v2). Safe to edit.',
     'version',          2
   ),
   2,
   1,
   now() - interval '5 days'),
  -- Homepage publish snapshot — mirrors what M5 publish writes so the
  -- page-revisions UI shows homepage history too. Shape must match
  -- `buildRevisionSnapshot` in lib/site-admin/server/homepage.ts exactly:
  -- { kind, page: {...PageRow subset}, composition: [HomepageSnapshotSection] }
  -- with camelCase section-entry keys (slotKey, sortOrder, sectionId,
  -- sectionTypeKey, schemaVersion, name, props).
  ('22220003-0000-4000-8000-000000000023'::UUID,
   '22222222-2222-2222-2222-222222222222'::UUID,
   '22220002-0000-4000-8000-00000000000e'::UUID,
   'published',
   jsonb_build_object(
     'kind', 'published',
     'page', jsonb_build_object(
       'locale',                  'en',
       'slug',                    '',
       'template_key',            'homepage',
       'system_template_key',     'homepage',
       'is_system_owned',         TRUE,
       'template_schema_version', 1,
       'title',                   'QA Agency — Home',
       'status',                  'published',
       'meta_title',              NULL,
       'meta_description',        NULL,
       'body',                    '',
       'hero',                    '{}'::jsonb,
       'og_title',                NULL,
       'og_description',          NULL,
       'og_image_media_asset_id', NULL,
       'noindex',                 FALSE,
       'include_in_sitemap',      TRUE,
       'canonical_url',           NULL,
       'version',                 2,
       'published_at',            to_char(now() - interval '2 days', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
     ),
     'composition', jsonb_build_array(
       jsonb_build_object(
         'slotKey',        'hero',
         'sortOrder',      0,
         'sectionId',      '22220001-0000-4000-8000-000000000001',
         'sectionTypeKey', 'hero',
         'schemaVersion',  1,
         'name',           'Homepage hero (live)',
         'props',          jsonb_build_object(
           'headline',    'Welcome to QA Agency',
           'subheadline', 'Phase 5 walkthrough fixture — this copy is safe to edit.',
           'primaryCta',  jsonb_build_object('label','Start a booking','href','/contact')
         )
       )
     )
   ),
   2,
   1,
   now() - interval '2 days')
ON CONFLICT (id) DO NOTHING;

-- Freeze the published homepage snapshot on the page row so public reads
-- serve the snapshot instead of live-joining cms_page_sections.

-- Canonical HomepageSnapshot shape — matches the `HomepageSnapshot` TS
-- interface in lib/site-admin/server/homepage.ts that publishHomepage
-- writes. The storefront reads .snapshot.slots / .fields directly off
-- this column, so the keys here MUST stay camelCase and MUST include:
--   version (literal 1), publishedAt, pageVersion, locale,
--   fields {title, metaDescription, introTagline},
--   templateSchemaVersion, slots [{slotKey, sortOrder, sectionId,
--     sectionTypeKey, schemaVersion, name, props}].
UPDATE public.cms_pages
   SET published_homepage_snapshot = jsonb_build_object(
         'version',               1,
         'publishedAt',           to_char(now() - interval '2 days', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
         'pageVersion',           2,
         'locale',                'en',
         'fields', jsonb_build_object(
           'title',            'QA Agency — Home',
           'metaDescription',  NULL,
           'introTagline',     NULL
         ),
         'templateSchemaVersion', 1,
         'slots', jsonb_build_array(
           jsonb_build_object(
             'slotKey',        'hero',
             'sortOrder',      0,
             'sectionId',      '22220001-0000-4000-8000-000000000001',
             'sectionTypeKey', 'hero',
             'schemaVersion',  1,
             'name',           'Homepage hero (live)',
             'props',          jsonb_build_object(
               'headline',    'Welcome to QA Agency',
               'subheadline', 'Phase 5 walkthrough fixture — this copy is safe to edit.',
               'primaryCta',  jsonb_build_object('label','Start a booking','href','/contact')
             )
           )
         )
       )
 WHERE id = '22220002-0000-4000-8000-00000000000e'::UUID;

-- ---------------------------------------------------------------------------
-- 7. cms_page_sections — composition junction (published + draft rows).
-- ---------------------------------------------------------------------------
--
-- Homepage EN has:
--   * is_draft=FALSE → HERO_LIVE   (what the storefront serves today)
--   * is_draft=TRUE  → HERO_ALT    (what the operator is drafting)
-- Composer UI should render "Draft ≠ live" and publishing should flip
-- the live row to HERO_ALT + refresh the snapshot.

INSERT INTO public.cms_page_sections (
  id, tenant_id, page_id, section_id, slot_key, sort_order, is_draft
)
VALUES
  ('22220004-0000-4000-8000-000000000001'::UUID,
   '22222222-2222-2222-2222-222222222222'::UUID,
   '22220002-0000-4000-8000-00000000000e'::UUID,
   '22220001-0000-4000-8000-000000000001'::UUID,
   'hero', 0, FALSE),
  ('22220004-0000-4000-8000-000000000002'::UUID,
   '22222222-2222-2222-2222-222222222222'::UUID,
   '22220002-0000-4000-8000-00000000000e'::UUID,
   '22220001-0000-4000-8000-000000000002'::UUID,
   'hero', 0, TRUE)
ON CONFLICT (id) DO UPDATE
  SET section_id = EXCLUDED.section_id,
      slot_key   = EXCLUDED.slot_key,
      sort_order = EXCLUDED.sort_order,
      is_draft   = EXCLUDED.is_draft,
      updated_at = now();

-- ---------------------------------------------------------------------------
-- 8. cms_navigation_items — DRAFT tree (header + footer × en + es).
-- ---------------------------------------------------------------------------
--
-- Items live on the draft working-set table. Published menu snapshots
-- (step 9) have a DIFFERENT shape so the Nav admin shows "unpublished
-- changes" and the storefront keeps serving the published tree.

INSERT INTO public.cms_navigation_items (
  id, tenant_id, locale, zone, parent_id, label, href, sort_order, visible, version
)
VALUES
  -- Header EN
  ('22220004-0000-4000-8000-000000000101'::UUID,
   '22222222-2222-2222-2222-222222222222'::UUID,
   'en', 'header', NULL, 'Home',      '/',        0, TRUE, 1),
  ('22220004-0000-4000-8000-000000000102'::UUID,
   '22222222-2222-2222-2222-222222222222'::UUID,
   'en', 'header', NULL, 'About',     '/about',   1, TRUE, 1),
  ('22220004-0000-4000-8000-000000000103'::UUID,
   '22222222-2222-2222-2222-222222222222'::UUID,
   'en', 'header', NULL, 'Launches',  '/launches',2, TRUE, 1),
  -- Header ES
  ('22220004-0000-4000-8000-000000000111'::UUID,
   '22222222-2222-2222-2222-222222222222'::UUID,
   'es', 'header', NULL, 'Inicio',   '/',       0, TRUE, 1),
  ('22220004-0000-4000-8000-000000000112'::UUID,
   '22222222-2222-2222-2222-222222222222'::UUID,
   'es', 'header', NULL, 'Sobre',    '/about',  1, TRUE, 1),
  -- Footer EN
  ('22220004-0000-4000-8000-000000000121'::UUID,
   '22222222-2222-2222-2222-222222222222'::UUID,
   'en', 'footer', NULL, 'Contact',  '/contact',0, TRUE, 1),
  ('22220004-0000-4000-8000-000000000122'::UUID,
   '22222222-2222-2222-2222-222222222222'::UUID,
   'en', 'footer', NULL, 'Privacy',  '/privacy',1, TRUE, 1),
  -- Footer ES
  ('22220004-0000-4000-8000-000000000131'::UUID,
   '22222222-2222-2222-2222-222222222222'::UUID,
   'es', 'footer', NULL, 'Contacto', '/contact',0, TRUE, 1)
ON CONFLICT (id) DO UPDATE
  SET label      = EXCLUDED.label,
      href       = EXCLUDED.href,
      sort_order = EXCLUDED.sort_order,
      visible    = EXCLUDED.visible,
      version    = EXCLUDED.version,
      updated_at = now();

-- ---------------------------------------------------------------------------
-- 9. cms_navigation_menus — PUBLISHED snapshot (deliberately ≠ draft).
-- ---------------------------------------------------------------------------
--
-- Published trees drop "Launches" (EN header) and "Privacy" (EN footer)
-- so the storefront renders a shorter menu than what the admin is drafting.
-- Re-publishing in the admin should promote the draft tree into these rows.

INSERT INTO public.cms_navigation_menus (
  id, tenant_id, zone, locale, tree_json, version, published_at
)
VALUES
  ('22220004-0000-4000-8000-000000000201'::UUID,
   '22222222-2222-2222-2222-222222222222'::UUID,
   'header', 'en',
   jsonb_build_array(
     jsonb_build_object('label','Home','href','/','sort_order',0,'visible',true,'children',jsonb_build_array()),
     jsonb_build_object('label','About','href','/about','sort_order',1,'visible',true,'children',jsonb_build_array())
   ),
   1,
   now() - interval '3 days'),
  ('22220004-0000-4000-8000-000000000202'::UUID,
   '22222222-2222-2222-2222-222222222222'::UUID,
   'header', 'es',
   jsonb_build_array(
     jsonb_build_object('label','Inicio','href','/','sort_order',0,'visible',true,'children',jsonb_build_array()),
     jsonb_build_object('label','Sobre','href','/about','sort_order',1,'visible',true,'children',jsonb_build_array())
   ),
   1,
   now() - interval '3 days'),
  ('22220004-0000-4000-8000-000000000203'::UUID,
   '22222222-2222-2222-2222-222222222222'::UUID,
   'footer', 'en',
   jsonb_build_array(
     jsonb_build_object('label','Contact','href','/contact','sort_order',0,'visible',true,'children',jsonb_build_array())
   ),
   1,
   now() - interval '3 days'),
  ('22220004-0000-4000-8000-000000000204'::UUID,
   '22222222-2222-2222-2222-222222222222'::UUID,
   'footer', 'es',
   jsonb_build_array(
     jsonb_build_object('label','Contacto','href','/contact','sort_order',0,'visible',true,'children',jsonb_build_array())
   ),
   1,
   now() - interval '3 days')
ON CONFLICT (tenant_id, zone, locale) DO UPDATE
  SET tree_json    = EXCLUDED.tree_json,
      version      = EXCLUDED.version,
      published_at = EXCLUDED.published_at,
      updated_at   = now();

-- cms_navigation_revisions — 1 prior snapshot per (zone, locale) so the
-- nav rollback UI shows at least one restorable version.

INSERT INTO public.cms_navigation_revisions (
  id, tenant_id, zone, locale, version, snapshot, created_at
)
VALUES
  ('22220003-0000-4000-8000-000000000031'::UUID,
   '22222222-2222-2222-2222-222222222222'::UUID,
   'header', 'en', 1,
   jsonb_build_array(
     jsonb_build_object('label','Home','href','/','sort_order',0,'visible',true,'children',jsonb_build_array())
   ),
   now() - interval '10 days'),
  ('22220003-0000-4000-8000-000000000032'::UUID,
   '22222222-2222-2222-2222-222222222222'::UUID,
   'footer', 'en', 1,
   jsonb_build_array(
     jsonb_build_object('label','Contact','href','/contact','sort_order',0,'visible',true,'children',jsonb_build_array()),
     jsonb_build_object('label','Privacy','href','/privacy','sort_order',1,'visible',true,'children',jsonb_build_array())
   ),
   now() - interval '8 days')
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- ===========================================================================
-- Verification queries (run after the script completes).
-- ===========================================================================
--
--  SELECT id, slug, display_name, status FROM public.agencies
--   WHERE id = '22222222-2222-2222-2222-222222222222';
--
--  SELECT hostname, kind, is_primary, status FROM public.agency_domains
--   WHERE tenant_id = '22222222-2222-2222-2222-222222222222';
--
--  SELECT status, count(*) FROM public.cms_sections
--   WHERE tenant_id = '22222222-2222-2222-2222-222222222222'
--   GROUP BY status;
--
--  SELECT slug, locale, status, is_system_owned FROM public.cms_pages
--   WHERE tenant_id = '22222222-2222-2222-2222-222222222222'
--   ORDER BY is_system_owned DESC, slug;
--
--  SELECT zone, locale, jsonb_array_length(tree_json) FROM public.cms_navigation_menus
--   WHERE tenant_id = '22222222-2222-2222-2222-222222222222';
--
--  SELECT theme_json, theme_json_draft FROM public.agency_branding
--   WHERE tenant_id = '22222222-2222-2222-2222-222222222222';
-- ===========================================================================
