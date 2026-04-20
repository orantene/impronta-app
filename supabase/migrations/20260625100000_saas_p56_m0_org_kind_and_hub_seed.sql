-- SaaS Phase 5/6 org-network extension — M0 step 1-3.
--
-- Ref: docs/saas/phase-5-6-org-network-extension.md §5.1, §5.2, §5.3, §6.2
--      steps 1–3 (forward/backfill/validation/rollback contract).
--
-- What this migration does
--   1. Add `organization_kind` ENUM ('agency','hub').
--   2. Add `agencies.kind` column with DEFAULT 'agency'; all existing rows
--      become 'agency' implicitly via the default. No ownership change.
--   3. Seed a single platform-hub org (`kind='hub'`, slug='hub').
--   4. Seed paired rows for the hub so every Phase-5 CMS surface has a
--      non-null anchor on day one:
--        - agency_business_identity  (public_name required)
--        - agency_branding           (theme_json required, empty default)
--        - cms_pages                 (homepage, is_system_owned=TRUE,
--                                    system_template_key='homepage' —
--                                    identical key to agency homes; the
--                                    runtime template resolver branches on
--                                    agencies.kind, keeping write paths
--                                    identical per M1 abstraction gate)
--        - cms_sections              (one placeholder section, draft)
--        - cms_navigation_menus      (header/en, empty tree, unpublished)
--
-- What this migration does NOT do
--   - Does NOT touch agency_domains (steps 4-5 in migration
--     20260625110000).
--   - Does NOT create the hub's super-admin memberships; platform
--     super_admins already have reach via is_agency_staff() RLS, which is
--     enough for M1 parity testing.
--   - Does NOT branch any code path on agencies.kind — that is the M1
--     abstraction gate's job.
--
-- Idempotent via IF NOT EXISTS / ON CONFLICT. Safe to re-run.
-- Additive (L18). Default on the new column makes it zero-downtime.

BEGIN;

-- ---------------------------------------------------------------------------
-- Preflight — fail fast if the reserved hub slug is already taken.
-- Step 2 of the migration plan requires `agencies.slug='hub'` to be unused.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_conflict_id UUID;
BEGIN
  SELECT id INTO v_conflict_id
    FROM public.agencies
   WHERE slug = 'hub'
     AND id <> '00000000-0000-0000-0000-000000000000'::UUID
   LIMIT 1;

  IF v_conflict_id IS NOT NULL THEN
    RAISE EXCEPTION
      'M0 preflight failed: an agency with slug=''hub'' already exists (id=%). '
      'Rename it before running this migration.', v_conflict_id;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Step 1 — organization_kind ENUM + agencies.kind column.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  CREATE TYPE public.organization_kind AS ENUM ('agency', 'hub');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

ALTER TABLE public.agencies
  ADD COLUMN IF NOT EXISTS kind public.organization_kind
    NOT NULL DEFAULT 'agency';

COMMENT ON COLUMN public.agencies.kind IS
  'Org-network extension M0. Discriminator between ''agency'' (tenant-owned '
  'business) and ''hub'' (platform-wide directory). Runtime resolvers branch '
  'on this; write paths stay identical. L45 — does not rename the table; '
  'distinct from agency_domains.kind (host-kind, not org-kind).';

-- Narrow index on the rare value so admin queries ("find the hub org") are
-- O(1) without scanning agency rows.
CREATE INDEX IF NOT EXISTS agencies_kind_hub_idx
  ON public.agencies (id)
  WHERE kind = 'hub';

-- ---------------------------------------------------------------------------
-- Step 2 — seed the single platform hub org.
--
-- Hub UUID is derived deterministically so downstream seeds in this file and
-- in migration 20260625110000 can reference it without coordinating state.
-- ---------------------------------------------------------------------------

-- Hub canonical UUID (locked 2026-04-20). Documented in
-- docs/saas/phase-5-6-org-network-extension.md §5.2.
-- Tenant #1 (Impronta Models) is the 'agency' rooted at the reserved UUID
-- '00000000-...-000000000001' (charter L13). The platform hub reserves the
-- next sequential slot '00000000-...-000000000002'. Regular-agency rows
-- continue to use gen_random_uuid(); only these two slots are reserved.
INSERT INTO public.agencies (
  id,
  slug,
  display_name,
  status,
  kind,
  template_key,
  supported_locales,
  onboarding_completed_at
)
VALUES (
  '00000000-0000-0000-0000-000000000002'::UUID,
  'hub',
  'Impronta Hub',
  'active',
  'hub'::public.organization_kind,
  'default',
  ARRAY['en','es']::TEXT[],
  now()
)
ON CONFLICT (id) DO UPDATE
  SET slug              = EXCLUDED.slug,
      display_name      = EXCLUDED.display_name,
      status            = EXCLUDED.status,
      kind              = EXCLUDED.kind,
      supported_locales = EXCLUDED.supported_locales,
      updated_at        = now();

-- ---------------------------------------------------------------------------
-- Step 3 — hub paired CMS rows.
--
-- Each row writes with the staff-policy in effect; the migration runs as the
-- migration role so RLS is bypassed. All tables are idempotent via
-- ON CONFLICT on their natural uniqueness.
-- ---------------------------------------------------------------------------

-- 3a. agency_business_identity — public_name required, rest nullable.
INSERT INTO public.agency_business_identity (
  tenant_id,
  public_name,
  tagline
)
VALUES (
  '00000000-0000-0000-0000-000000000002'::UUID,
  'Impronta Hub',
  'The global talent directory.'
)
ON CONFLICT (tenant_id) DO UPDATE
  SET public_name = EXCLUDED.public_name,
      tagline     = EXCLUDED.tagline,
      updated_at  = now();

-- 3b. agency_branding — empty theme by default; hub design is edited later
--     through the same CMS surfaces as agency branding (abstraction gate).
INSERT INTO public.agency_branding (tenant_id, theme_json)
VALUES ('00000000-0000-0000-0000-000000000002'::UUID, '{}'::JSONB)
ON CONFLICT (tenant_id) DO NOTHING;

-- 3c. cms_pages — hub homepage.
--     slug = '' is permitted for system-owned homepages per
--     20260620170000_saas_p5_m0_fix_homepage_slug_constraint.sql.
--     system_template_key = 'homepage' is the same value agency homes use;
--     the template pack resolves at render time via agencies.kind.
INSERT INTO public.cms_pages (
  tenant_id,
  locale,
  slug,
  template_key,
  title,
  status,
  body,
  is_system_owned,
  system_template_key,
  include_in_sitemap,
  published_at
)
VALUES (
  '00000000-0000-0000-0000-000000000002'::UUID,
  'en',
  '',
  'homepage',
  'Impronta Hub',
  'published',
  '',
  TRUE,
  'homepage',
  TRUE,
  now()
)
ON CONFLICT (tenant_id, locale, slug) DO UPDATE
  SET title               = EXCLUDED.title,
      status              = EXCLUDED.status,
      is_system_owned     = EXCLUDED.is_system_owned,
      system_template_key = EXCLUDED.system_template_key,
      include_in_sitemap  = EXCLUDED.include_in_sitemap,
      published_at        = COALESCE(public.cms_pages.published_at, EXCLUDED.published_at),
      updated_at          = now();

-- 3d. cms_sections — one placeholder so the sections surface isn't empty on
--     day-one admin navigation. Draft status; invisible on storefront.
INSERT INTO public.cms_sections (
  tenant_id,
  section_type_key,
  name,
  props_jsonb,
  status
)
VALUES (
  '00000000-0000-0000-0000-000000000002'::UUID,
  'hero_stack',
  'Hub welcome',
  '{}'::JSONB,
  'draft'::public.cms_section_status
)
ON CONFLICT (tenant_id, name) DO NOTHING;

-- 3e. cms_navigation_menus — header + footer, EN locale, empty trees.
--     The site-admin navigation editor will seed tree_json during M1.
INSERT INTO public.cms_navigation_menus (
  tenant_id,
  zone,
  locale,
  tree_json
)
VALUES
  ('00000000-0000-0000-0000-000000000002'::UUID, 'header', 'en', '[]'::JSONB),
  ('00000000-0000-0000-0000-000000000002'::UUID, 'footer', 'en', '[]'::JSONB)
ON CONFLICT (tenant_id, zone, locale) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Post-migration validation block. Raises if any invariant fails.
-- Mirrors the validation queries in §6.2 so operators can re-run in psql.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_hub_count INT;
  v_paired    INT;
BEGIN
  -- Exactly one kind='hub' row.
  SELECT COUNT(*) INTO v_hub_count
    FROM public.agencies
   WHERE kind = 'hub';
  IF v_hub_count <> 1 THEN
    RAISE EXCEPTION 'M0 validation: expected exactly 1 kind=''hub'' agency, found %', v_hub_count;
  END IF;

  -- All existing agencies have a non-null kind (no NULLs after column add).
  IF EXISTS (SELECT 1 FROM public.agencies WHERE kind IS NULL) THEN
    RAISE EXCEPTION 'M0 validation: agencies.kind has NULLs (should be impossible with NOT NULL DEFAULT)';
  END IF;

  -- Paired rows exist for the hub: identity + branding + page + section + 2 menus.
  SELECT
      (SELECT COUNT(*) FROM public.agency_business_identity WHERE tenant_id = '00000000-0000-0000-0000-000000000002'::UUID)
    + (SELECT COUNT(*) FROM public.agency_branding          WHERE tenant_id = '00000000-0000-0000-0000-000000000002'::UUID)
    + (SELECT COUNT(*) FROM public.cms_pages                WHERE tenant_id = '00000000-0000-0000-0000-000000000002'::UUID AND is_system_owned AND system_template_key = 'homepage')
    + (SELECT COUNT(*) FROM public.cms_sections             WHERE tenant_id = '00000000-0000-0000-0000-000000000002'::UUID)
    + (SELECT COUNT(*) FROM public.cms_navigation_menus     WHERE tenant_id = '00000000-0000-0000-0000-000000000002'::UUID)
    INTO v_paired;
  -- Expected minimum: 1 + 1 + 1 + 1 + 2 = 6.
  IF v_paired < 6 THEN
    RAISE EXCEPTION 'M0 validation: expected >=6 hub paired rows across 5 tables, found %', v_paired;
  END IF;
END
$$;

COMMIT;

-- ---------------------------------------------------------------------------
-- Rollback reference (manual; migration framework does not auto-reverse):
-- ---------------------------------------------------------------------------
--
-- BEGIN;
--   DELETE FROM public.cms_navigation_menus
--     WHERE tenant_id = '00000000-0000-0000-0000-000000000002'::UUID;
--   DELETE FROM public.cms_sections
--     WHERE tenant_id = '00000000-0000-0000-0000-000000000002'::UUID;
--   -- is_system_owned blocks DELETE via the guard trigger. Clear the flag
--   -- explicitly; the update is allowed because we match on system_template_key
--   -- not the locked fields.
--   UPDATE public.cms_pages
--      SET is_system_owned = FALSE
--    WHERE tenant_id = '00000000-0000-0000-0000-000000000002'::UUID;
--   DELETE FROM public.cms_pages
--     WHERE tenant_id = '00000000-0000-0000-0000-000000000002'::UUID;
--   DELETE FROM public.agency_branding
--     WHERE tenant_id = '00000000-0000-0000-0000-000000000002'::UUID;
--   DELETE FROM public.agency_business_identity
--     WHERE tenant_id = '00000000-0000-0000-0000-000000000002'::UUID;
--   DELETE FROM public.agencies
--     WHERE id = '00000000-0000-0000-0000-000000000002'::UUID;
--   DROP INDEX IF EXISTS public.agencies_kind_hub_idx;
--   ALTER TABLE public.agencies DROP COLUMN IF EXISTS kind;
--   DROP TYPE IF EXISTS public.organization_kind;
-- COMMIT;
--
-- NOTE: Requires that migration 20260625110000 (domain rebind) is rolled back
-- first, otherwise the hub-domain tenant_id FK will block the DELETE FROM
-- agencies.
