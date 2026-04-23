-- SaaS Phase 5 — tenant-owned brand mark (inline SVG) on agency_branding.
--
-- Context: PublicHeader only renders the text brandLabel. The existing
-- logo_media_asset_id column references media_assets, which is talent-owned
-- (owner_talent_profile_id NOT NULL) — not suitable for tenant logos without
-- schema churn. Inline SVG is the simplest path: stored on the branding row
-- itself, sanitized + length-bounded at the application layer, rendered
-- directly into the DOM using currentColor so the design-token palette
-- flows through.
--
-- Size bound: 20 KiB at the DB level is a sanity ceiling; the application
-- enforces a tighter cap (and an allowlist) before the value lands here.

BEGIN;

ALTER TABLE public.agency_branding
  ADD COLUMN IF NOT EXISTS brand_mark_svg TEXT NULL;

-- DB-side sanity ceiling. Application layer enforces the tighter cap +
-- allowlist. NULL passes the check so existing rows stay valid.
ALTER TABLE public.agency_branding
  DROP CONSTRAINT IF EXISTS agency_branding_brand_mark_svg_len_chk;

ALTER TABLE public.agency_branding
  ADD CONSTRAINT agency_branding_brand_mark_svg_len_chk
  CHECK (brand_mark_svg IS NULL OR length(brand_mark_svg) <= 20480);

COMMENT ON COLUMN public.agency_branding.brand_mark_svg IS
  'Inline SVG markup for the tenant brand mark. Sanitized (allowlist) and size-bounded at the app layer; rendered into PublicHeader using currentColor so design tokens drive the color. Prefer a single <svg> root with no <script>, event handlers, or external hrefs.';

COMMIT;
