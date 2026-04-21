-- SaaS Phase 5 / M0 — Agency Site Admin foundations.
--
-- Ref: /Users/oranpersonal/.cursor/plans/agency_site_admin_phase_cccd654c.plan.md
--      (Locked schema decisions section; M0 migration batch).
--
-- This migration ships the full schema surface consumed by M1..M6:
--   1. agency_business_identity (normalized public identity, one row per tenant)
--   2. agency_business_identity_revisions (append-only audit snapshot)
--   3. agency_branding additions (version + updated_by + revisions)
--   4. agency_branding_revisions (append-only audit snapshot)
--   5. cms_pages additions (is_system_owned + system_template_key +
--      template_schema_version + version + og_image_media_asset_id +
--      published_homepage_snapshot); system-ownership guard trigger
--   6. cms_page_sections generalized junction (page -> section instances)
--   7. cms_sections (per-tenant reusable section instances)
--   8. cms_section_revisions (append-only snapshot)
--   9. platform_reserved_slugs (reserved route enforcement; layer 2 of 3)
--  10. cms_sections_props_media_ref_check trigger (referential integrity
--      for media ids embedded inside registry-governed props_jsonb)
--  11. media_assets extension: nullable owner_talent_profile_id,
--      new tenant_id + purpose columns, backfill, CHECK constraint, RLS update
--
-- All writes obey existing is_staff_of_tenant() RLS pattern. No data loss.
-- Idempotent via IF NOT EXISTS / DROP IF EXISTS.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. agency_business_identity — public identity of the agency
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.agency_business_identity (
  tenant_id         UUID        PRIMARY KEY
                                REFERENCES public.agencies(id) ON DELETE CASCADE,
  public_name       TEXT        NOT NULL,
  legal_name        TEXT,
  tagline           TEXT,
  footer_tagline    TEXT,
  contact_email     TEXT,
  contact_phone     TEXT,
  whatsapp          TEXT,
  address_city      TEXT,
  address_country   TEXT,
  service_area      TEXT,
  social_instagram  TEXT,
  social_tiktok     TEXT,
  social_facebook   TEXT,
  social_linkedin   TEXT,
  social_youtube    TEXT,
  social_x          TEXT,
  version           INTEGER     NOT NULL DEFAULT 1,
  updated_by        UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agency_business_identity_public_name_nonempty
    CHECK (char_length(trim(public_name)) > 0)
);

COMMENT ON TABLE public.agency_business_identity IS
  'Phase 5 M1. Normalized per-tenant public identity + contact info. Single row per agency. Writes via requireCapability(agency.site_admin.identity.edit).';

ALTER TABLE public.agency_business_identity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agency_business_identity_staff_all
  ON public.agency_business_identity;
CREATE POLICY agency_business_identity_staff_all
  ON public.agency_business_identity
  FOR ALL
  USING       (public.is_staff_of_tenant(tenant_id))
  WITH CHECK  (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS agency_business_identity_public_select
  ON public.agency_business_identity;
CREATE POLICY agency_business_identity_public_select
  ON public.agency_business_identity
  FOR SELECT
  USING (tenant_id = public.current_tenant_id());

CREATE OR REPLACE FUNCTION public.agency_business_identity_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agency_business_identity_touch_updated_at
  ON public.agency_business_identity;
CREATE TRIGGER trg_agency_business_identity_touch_updated_at
  BEFORE UPDATE ON public.agency_business_identity
  FOR EACH ROW EXECUTE FUNCTION public.agency_business_identity_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 2. agency_business_identity_revisions — append-only snapshot
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.agency_business_identity_revisions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  version     INTEGER     NOT NULL,
  snapshot    JSONB       NOT NULL,
  created_by  UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agency_business_identity_revisions_tenant_created
  ON public.agency_business_identity_revisions (tenant_id, created_at DESC);

COMMENT ON TABLE public.agency_business_identity_revisions IS
  'Append-only per-version snapshot of agency_business_identity. Retention: 20 most recent per tenant (trimmed async by cron).';

ALTER TABLE public.agency_business_identity_revisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agency_business_identity_revisions_staff_read
  ON public.agency_business_identity_revisions;
CREATE POLICY agency_business_identity_revisions_staff_read
  ON public.agency_business_identity_revisions
  FOR SELECT
  USING (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS agency_business_identity_revisions_staff_insert
  ON public.agency_business_identity_revisions;
CREATE POLICY agency_business_identity_revisions_staff_insert
  ON public.agency_business_identity_revisions
  FOR INSERT
  WITH CHECK (public.is_staff_of_tenant(tenant_id));

-- ---------------------------------------------------------------------------
-- 3. agency_branding additions — optimistic concurrency + last actor
-- ---------------------------------------------------------------------------

ALTER TABLE public.agency_branding
  ADD COLUMN IF NOT EXISTS version    INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS updated_by UUID    REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 4. agency_branding_revisions — append-only snapshot
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.agency_branding_revisions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  version     INTEGER     NOT NULL,
  snapshot    JSONB       NOT NULL,
  created_by  UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agency_branding_revisions_tenant_created
  ON public.agency_branding_revisions (tenant_id, created_at DESC);

COMMENT ON TABLE public.agency_branding_revisions IS
  'Append-only per-version snapshot of agency_branding (including theme_json). Retention: 20 most recent per tenant.';

ALTER TABLE public.agency_branding_revisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agency_branding_revisions_staff_read
  ON public.agency_branding_revisions;
CREATE POLICY agency_branding_revisions_staff_read
  ON public.agency_branding_revisions
  FOR SELECT
  USING (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS agency_branding_revisions_staff_insert
  ON public.agency_branding_revisions;
CREATE POLICY agency_branding_revisions_staff_insert
  ON public.agency_branding_revisions
  FOR INSERT
  WITH CHECK (public.is_staff_of_tenant(tenant_id));

-- ---------------------------------------------------------------------------
-- 5. cms_pages additions — system pages, template version, concurrency,
--                         optional SEO media, optional homepage snapshot.
-- ---------------------------------------------------------------------------

ALTER TABLE public.cms_pages
  ADD COLUMN IF NOT EXISTS is_system_owned          BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS system_template_key      TEXT,
  ADD COLUMN IF NOT EXISTS template_schema_version  INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS version                  INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS og_image_media_asset_id  UUID
                                                    REFERENCES public.media_assets(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS published_homepage_snapshot JSONB;

-- Lookup index for system pages by their template key per tenant/locale.
CREATE UNIQUE INDEX IF NOT EXISTS cms_pages_system_lookup_idx
  ON public.cms_pages (tenant_id, locale, system_template_key)
  WHERE is_system_owned = TRUE AND system_template_key IS NOT NULL;

-- System-ownership guard trigger.
-- Blocks: DELETE when is_system_owned; UPDATE when is_system_owned and the
-- update mutates slug, locale, template_key, is_system_owned, or
-- system_template_key. All other updates (body, hero, meta, status, etc.)
-- flow through normally.
CREATE OR REPLACE FUNCTION public.cms_pages_system_ownership_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.is_system_owned THEN
      RAISE EXCEPTION 'SYSTEM_PAGE_IMMUTABLE: cannot delete system-owned page %', OLD.id
        USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.is_system_owned THEN
    IF NEW.slug                <> OLD.slug
    OR NEW.locale              <> OLD.locale
    OR NEW.template_key        <> OLD.template_key
    OR NEW.is_system_owned     <> OLD.is_system_owned
    OR COALESCE(NEW.system_template_key, '') <> COALESCE(OLD.system_template_key, '') THEN
      RAISE EXCEPTION 'SYSTEM_PAGE_IMMUTABLE: locked fields cannot be modified on system-owned page %', OLD.id
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cms_pages_system_ownership_guard ON public.cms_pages;
CREATE TRIGGER trg_cms_pages_system_ownership_guard
  BEFORE UPDATE OR DELETE ON public.cms_pages
  FOR EACH ROW EXECUTE FUNCTION public.cms_pages_system_ownership_guard();

COMMENT ON COLUMN public.cms_pages.is_system_owned IS
  'Phase 5 M0. When TRUE, DB trigger blocks delete + slug/locale/template_key changes. System pages (e.g. homepage) are seeded by platform, edited in-place by tenant.';

COMMENT ON COLUMN public.cms_pages.system_template_key IS
  'Phase 5 M0. Pairs with is_system_owned. Values like ''homepage'' key the composite-key router lookup.';

COMMENT ON COLUMN public.cms_pages.template_schema_version IS
  'Phase 5 M0. Bumped when the page template schema migrates (see templates registry). Editor calls migrate() on load if persisted < current.';

COMMENT ON COLUMN public.cms_pages.version IS
  'Phase 5 M0. Optimistic concurrency token. Mutation path: UPDATE ... SET version = expectedVersion + 1 WHERE id = ? AND version = expectedVersion.';

-- ---------------------------------------------------------------------------
-- 6. cms_page_sections — generalized junction (page -> section instances)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.cms_page_sections (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  page_id     UUID        NOT NULL REFERENCES public.cms_pages(id) ON DELETE CASCADE,
  section_id  UUID        NOT NULL, -- FK added below (after cms_sections exists)
  slot_key    TEXT        NOT NULL,
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  is_draft    BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT cms_page_sections_slot_nonempty
    CHECK (char_length(trim(slot_key)) > 0)
);

-- Slots are ordered within (page, slot). Draft vs live composition share the
-- same table; is_draft flags draft-only rows, so a page can have both.
CREATE UNIQUE INDEX IF NOT EXISTS cms_page_sections_page_slot_order_key
  ON public.cms_page_sections (page_id, slot_key, sort_order, is_draft);

CREATE INDEX IF NOT EXISTS idx_cms_page_sections_tenant_page
  ON public.cms_page_sections (tenant_id, page_id);

COMMENT ON TABLE public.cms_page_sections IS
  'Phase 5 M0. Generalized page -> section instance junction. Consumed by M5 homepage composition; inert for non-homepage pages in Phase 5.';

ALTER TABLE public.cms_page_sections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cms_page_sections_staff_all ON public.cms_page_sections;
CREATE POLICY cms_page_sections_staff_all ON public.cms_page_sections
  FOR ALL
  USING       (public.is_staff_of_tenant(tenant_id))
  WITH CHECK  (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS cms_page_sections_public_select ON public.cms_page_sections;
CREATE POLICY cms_page_sections_public_select ON public.cms_page_sections
  FOR SELECT
  USING (tenant_id = public.current_tenant_id() AND is_draft = FALSE);

-- ---------------------------------------------------------------------------
-- 7. cms_sections — per-tenant reusable section instances
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  CREATE TYPE public.cms_section_status AS ENUM ('draft', 'published', 'archived');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS public.cms_sections (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID        NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  section_type_key   TEXT        NOT NULL,
  name               TEXT        NOT NULL,
  props_jsonb        JSONB       NOT NULL DEFAULT '{}'::JSONB,
  status             public.cms_section_status NOT NULL DEFAULT 'draft',
  schema_version     INTEGER     NOT NULL DEFAULT 1,
  version            INTEGER     NOT NULL DEFAULT 1,
  created_by         UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by         UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT cms_sections_name_nonempty
    CHECK (char_length(trim(name)) > 0),
  CONSTRAINT cms_sections_section_type_key_nonempty
    CHECK (char_length(trim(section_type_key)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS cms_sections_tenant_name_key
  ON public.cms_sections (tenant_id, name);

CREATE INDEX IF NOT EXISTS idx_cms_sections_tenant_type
  ON public.cms_sections (tenant_id, section_type_key);

COMMENT ON TABLE public.cms_sections IS
  'Phase 5 M4. Per-tenant reusable section instances. section_type_key references the platform section registry; schema_version tracks migration contract.';

ALTER TABLE public.cms_sections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cms_sections_staff_all ON public.cms_sections;
CREATE POLICY cms_sections_staff_all ON public.cms_sections
  FOR ALL
  USING       (public.is_staff_of_tenant(tenant_id))
  WITH CHECK  (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS cms_sections_public_select ON public.cms_sections;
CREATE POLICY cms_sections_public_select ON public.cms_sections
  FOR SELECT
  USING (tenant_id = public.current_tenant_id() AND status = 'published');

-- Now that cms_sections exists, add the RESTRICT FK from the junction.
ALTER TABLE public.cms_page_sections
  ADD CONSTRAINT cms_page_sections_section_id_fkey
  FOREIGN KEY (section_id) REFERENCES public.cms_sections(id) ON DELETE RESTRICT
  NOT VALID;
ALTER TABLE public.cms_page_sections
  VALIDATE CONSTRAINT cms_page_sections_section_id_fkey;

CREATE OR REPLACE FUNCTION public.cms_sections_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cms_sections_touch_updated_at ON public.cms_sections;
CREATE TRIGGER trg_cms_sections_touch_updated_at
  BEFORE UPDATE ON public.cms_sections
  FOR EACH ROW EXECUTE FUNCTION public.cms_sections_touch_updated_at();

DROP TRIGGER IF EXISTS trg_cms_page_sections_touch_updated_at ON public.cms_page_sections;
CREATE TRIGGER trg_cms_page_sections_touch_updated_at
  BEFORE UPDATE ON public.cms_page_sections
  FOR EACH ROW EXECUTE FUNCTION public.cms_sections_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 8. cms_section_revisions — append-only snapshot
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.cms_section_revisions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  section_id  UUID        NOT NULL REFERENCES public.cms_sections(id) ON DELETE CASCADE,
  version     INTEGER     NOT NULL,
  schema_version INTEGER  NOT NULL,
  kind        public.cms_revision_kind NOT NULL,
  snapshot    JSONB       NOT NULL,
  created_by  UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cms_section_revisions_section_created
  ON public.cms_section_revisions (section_id, created_at DESC);

ALTER TABLE public.cms_section_revisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cms_section_revisions_staff_read ON public.cms_section_revisions;
CREATE POLICY cms_section_revisions_staff_read ON public.cms_section_revisions
  FOR SELECT
  USING (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS cms_section_revisions_staff_insert ON public.cms_section_revisions;
CREATE POLICY cms_section_revisions_staff_insert ON public.cms_section_revisions
  FOR INSERT
  WITH CHECK (public.is_staff_of_tenant(tenant_id));

-- ---------------------------------------------------------------------------
-- 9. platform_reserved_slugs — DB layer of the 3-layer reserved-route guard
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.platform_reserved_slugs (
  slug        TEXT        PRIMARY KEY,
  reason      TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT platform_reserved_slugs_slug_nonempty CHECK (char_length(trim(slug)) > 0)
);

COMMENT ON TABLE public.platform_reserved_slugs IS
  'Phase 5 M0. DB layer of the 3-layer reserved-route guard. Layer 1: Zod registry (web/src/lib/site-admin/reserved-routes.ts). Layer 2: this table + trigger. Layer 3: middleware log.';

-- Seed with platform-known reserved slugs. New entries added by platform admin only.
INSERT INTO public.platform_reserved_slugs (slug, reason) VALUES
  ('admin',       'admin workspace root'),
  ('api',         'HTTP API surface'),
  ('auth',        'auth routes'),
  ('onboarding',  'onboarding flow'),
  ('t',           'tenant router prefix'),
  ('sitemap.xml', 'sitemap output'),
  ('robots.txt',  'robots output'),
  ('_next',       'Next.js internals'),
  ('favicon.ico', 'favicon'),
  ('error',       'error surface'),
  ('not-found',   'not-found surface')
ON CONFLICT (slug) DO NOTHING;

ALTER TABLE public.platform_reserved_slugs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_reserved_slugs_read_all ON public.platform_reserved_slugs;
CREATE POLICY platform_reserved_slugs_read_all ON public.platform_reserved_slugs
  FOR SELECT
  USING (TRUE);

DROP POLICY IF EXISTS platform_reserved_slugs_platform_write ON public.platform_reserved_slugs;
CREATE POLICY platform_reserved_slugs_platform_write ON public.platform_reserved_slugs
  FOR ALL
  USING       (public.is_platform_admin())
  WITH CHECK  (public.is_platform_admin());

CREATE OR REPLACE FUNCTION public.cms_pages_reserved_slug_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  first_segment TEXT;
BEGIN
  -- Extract the first URL path segment from slug.
  -- For homepage pages, slug = '' is allowed (composite-key binding).
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    RETURN NEW;
  END IF;

  first_segment := split_part(regexp_replace(NEW.slug, '^/+', ''), '/', 1);

  IF EXISTS (
    SELECT 1 FROM public.platform_reserved_slugs
    WHERE slug = first_segment
  ) THEN
    -- System-owned pages authored by platform can use any slug; only block
    -- tenant-authored pages from colliding.
    IF NOT NEW.is_system_owned THEN
      RAISE EXCEPTION 'RESERVED_SLUG: slug "%" reserved by platform', first_segment
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cms_pages_reserved_slug_guard ON public.cms_pages;
CREATE TRIGGER trg_cms_pages_reserved_slug_guard
  BEFORE INSERT OR UPDATE OF slug ON public.cms_pages
  FOR EACH ROW EXECUTE FUNCTION public.cms_pages_reserved_slug_guard();

-- ---------------------------------------------------------------------------
-- 10. cms_sections_props_media_ref_check — referential integrity for
--     media ids embedded inside props_jsonb. Enforces that every UUID
--     under the conventional key "mediaAssetId" (registry convention)
--     references a live (non-soft-deleted) media_assets row.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cms_sections_props_media_ref_check()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  media_id UUID;
BEGIN
  -- Walk all string values in props_jsonb with key mediaAssetId.
  FOR media_id IN
    SELECT value::UUID
    FROM jsonb_path_query(NEW.props_jsonb, '$.**.mediaAssetId') AS t(value)
    WHERE jsonb_typeof(value) = 'string'
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.media_assets
      WHERE id = media_id AND deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'MEDIA_REF_BROKEN: media asset % missing or soft-deleted', media_id
        USING ERRCODE = '23503';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cms_sections_props_media_ref_check ON public.cms_sections;
CREATE TRIGGER trg_cms_sections_props_media_ref_check
  BEFORE INSERT OR UPDATE OF props_jsonb ON public.cms_sections
  FOR EACH ROW EXECUTE FUNCTION public.cms_sections_props_media_ref_check();

-- ---------------------------------------------------------------------------
-- 11. media_assets extension — tenant-scoped non-talent media support
-- ---------------------------------------------------------------------------
--
-- Before: owner_talent_profile_id NOT NULL. Meant no CMS or branding asset
-- could be uploaded without being tied to a talent.
-- After:  owner_talent_profile_id nullable; tenant_id populated; purpose
-- enum distinguishes talent / branding / cms. CHECK keeps each row owned
-- either by a talent (legacy) or a tenant (new Phase 5 uses).

DO $$
BEGIN
  CREATE TYPE public.media_purpose AS ENUM ('talent', 'branding', 'cms', 'starter_kit');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

ALTER TABLE public.media_assets
  ALTER COLUMN owner_talent_profile_id DROP NOT NULL;

ALTER TABLE public.media_assets
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.agencies(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS purpose   public.media_purpose NOT NULL DEFAULT 'talent';

-- Backfill tenant_id for legacy talent-owned rows via agency_talent_roster.
-- talent_profiles has no tenant_id column — the tenant↔talent link lives in
-- public.agency_talent_roster (added in SaaS P1.A.6). For each talent-owned
-- media asset we pick the talent's primary active tenant; if there's no
-- primary, we take any active row (most recently added), which matches the
-- P1 backfill that put every legacy talent onto tenant #1.
UPDATE public.media_assets m
   SET tenant_id = r.tenant_id
  FROM (
    SELECT DISTINCT ON (talent_profile_id)
           talent_profile_id,
           tenant_id
      FROM public.agency_talent_roster
     WHERE status IN ('active','pending')
     ORDER BY talent_profile_id,
              is_primary DESC,
              added_at DESC
  ) r
 WHERE m.owner_talent_profile_id = r.talent_profile_id
   AND m.tenant_id IS NULL;

-- Anything still null (talent with no roster row, or non-talent-owned rows
-- that predate this migration) falls back to the seed tenant to keep the
-- NOT-NULL invariant. Matches the P1 backfill convention.
UPDATE public.media_assets
   SET tenant_id = '00000000-0000-0000-0000-000000000001'::UUID
 WHERE tenant_id IS NULL;

ALTER TABLE public.media_assets
  ALTER COLUMN tenant_id SET NOT NULL;

-- Enforce: every asset is owned either by a talent or scoped to a tenant-only
-- purpose (branding / cms / starter_kit). Talent rows keep owner_talent_profile_id.
ALTER TABLE public.media_assets
  DROP CONSTRAINT IF EXISTS media_assets_owner_or_purpose_check;
ALTER TABLE public.media_assets
  ADD CONSTRAINT media_assets_owner_or_purpose_check
  CHECK (
    (purpose = 'talent' AND owner_talent_profile_id IS NOT NULL)
    OR (purpose <> 'talent')
  );

CREATE INDEX IF NOT EXISTS idx_media_assets_tenant_purpose
  ON public.media_assets (tenant_id, purpose)
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN public.media_assets.tenant_id IS
  'Phase 5 M0. Tenant-scope for all media. For talent-owned rows, backfilled via agency_talent_roster (primary active tenant); non-talent or orphaned rows fall back to the seed tenant.';

COMMENT ON COLUMN public.media_assets.purpose IS
  'Phase 5 M0. talent=legacy profile media; branding=logos/favicons/OG; cms=page/section media; starter_kit=registry-owned seed media.';

-- Staff-of-tenant policy for tenant-scoped non-talent uploads.
-- (Existing talent-scoped RLS on media_assets is preserved by init.sql.)
DROP POLICY IF EXISTS media_assets_tenant_staff_all ON public.media_assets;
CREATE POLICY media_assets_tenant_staff_all ON public.media_assets
  FOR ALL
  USING       (purpose <> 'talent' AND public.is_staff_of_tenant(tenant_id))
  WITH CHECK  (purpose <> 'talent' AND public.is_staff_of_tenant(tenant_id));

-- ---------------------------------------------------------------------------
-- 12. record_phase5_audit — SECURITY DEFINER wrapper for platform_audit_log
--     inserts from Phase 5 mutations. Verifies caller is staff of the
--     supplied tenant before inserting.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_phase5_audit(
  p_tenant_id      UUID,
  p_action         TEXT,
  p_target_type    TEXT,
  p_target_id      TEXT,
  p_diff_summary   TEXT,
  p_before_hash    TEXT,
  p_after_hash     TEXT,
  p_correlation_id TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID;
  v_id    UUID;
BEGIN
  v_actor := auth.uid();

  IF NOT public.is_staff_of_tenant(p_tenant_id) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = format('record_phase5_audit: caller not staff of tenant %s', p_tenant_id);
  END IF;

  IF p_action IS NULL OR p_action NOT LIKE 'agency.site_admin.%' THEN
    RAISE EXCEPTION 'record_phase5_audit: action must start with agency.site_admin. (got: %)', p_action
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.platform_audit_log (
    actor_profile_id, actor_role, action, target_type, target_id, tenant_id, metadata
  ) VALUES (
    v_actor,
    'agency_staff',
    p_action,
    p_target_type,
    p_target_id,
    p_tenant_id,
    jsonb_build_object(
      'diff_summary',    left(coalesce(p_diff_summary, ''), 240),
      'before_hash',     p_before_hash,
      'after_hash',      p_after_hash,
      'correlation_id',  p_correlation_id
    )
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.record_phase5_audit IS
  'Phase 5 M0. Security-definer wrapper for platform_audit_log inserts from Phase 5 admin mutations. Enforces is_staff_of_tenant + action prefix. Diff fields nest in metadata to avoid schema changes on platform_audit_log.';

-- Grant EXECUTE to authenticated + anon (the is_staff_of_tenant check inside
-- the body is the real gate; anon will fail it).
GRANT EXECUTE ON FUNCTION public.record_phase5_audit(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

COMMIT;
