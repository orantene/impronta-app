-- Migration F3 — inquiry source attribution.
--
-- Adds two columns to `inquiries` for cross-tenant origin tracking:
--
--   source_workspace_id UUID  — the agency whose storefront (or the hub) the
--       inquiry was submitted from. For a typical agency-storefront submission
--       this equals tenant_id. For a hub-originated submission it equals the
--       hub agency tenant_id (which differs from tenant_id, the receiving
--       agency). Nullable: older rows have no origin data.
--
--   origin_domain TEXT — the exact request hostname where the inquiry form
--       was submitted (e.g. "improntamodels.com", "tulala.digital"). Nullable
--       for the same reason.
--
-- These fields are write-once from the server action at submission time via
-- getPublicHostContext(). They are never updated after creation.

ALTER TABLE public.inquiries
  ADD COLUMN IF NOT EXISTS source_workspace_id UUID
    REFERENCES public.agencies(id)
    ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS origin_domain TEXT;

-- Analytics index: "show me all inquiries that came from improntamodels.com"
CREATE INDEX IF NOT EXISTS idx_inquiries_origin_domain
  ON public.inquiries(origin_domain)
  WHERE origin_domain IS NOT NULL;

-- Attribution index: "show me inquiries that came via the hub"
CREATE INDEX IF NOT EXISTS idx_inquiries_source_workspace_id
  ON public.inquiries(source_workspace_id)
  WHERE source_workspace_id IS NOT NULL;
