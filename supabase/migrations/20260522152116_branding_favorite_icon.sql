-- Migration: add favorite_icon to agency_branding
--
-- Stores the per-tenant card favorite icon preference (heart vs bookmark).
-- Publicly readable via the existing agency_branding_public_select RLS policy
-- so the storefront can render the correct icon without service-role access.
--
-- Default: 'bookmark' (preserves existing behaviour for all tenants).

ALTER TABLE agency_branding
  ADD COLUMN IF NOT EXISTS favorite_icon text
    CHECK (favorite_icon IN ('heart', 'bookmark'))
    DEFAULT 'bookmark';

COMMENT ON COLUMN agency_branding.favorite_icon IS
  'Per-tenant favorite card icon: ''heart'' or ''bookmark''. Defaults to ''bookmark''.';
