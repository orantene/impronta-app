-- F3 follow-up — source attribution on relationship tables.
--
-- Inquiries already carry:
--   - source_workspace_id
--   - origin_domain
--
-- This migration extends the same attribution semantics to:
--   - agency_talent_roster
--   - agency_client_relationships
--
-- For these relationship rows, source_workspace_id should always resolve to
-- the row's tenant_id (same workspace context). We still store it explicitly
-- for analytics parity and future cross-surface audits.

BEGIN;

ALTER TABLE public.agency_talent_roster
  ADD COLUMN IF NOT EXISTS source_workspace_id UUID REFERENCES public.agencies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS origin_domain TEXT;

ALTER TABLE public.agency_client_relationships
  ADD COLUMN IF NOT EXISTS source_workspace_id UUID REFERENCES public.agencies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS origin_domain TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agency_talent_roster_source_workspace_matches_tenant'
  ) THEN
    ALTER TABLE public.agency_talent_roster
      ADD CONSTRAINT agency_talent_roster_source_workspace_matches_tenant
      CHECK (source_workspace_id IS NULL OR source_workspace_id = tenant_id);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agency_client_relationships_source_workspace_matches_tenant'
  ) THEN
    ALTER TABLE public.agency_client_relationships
      ADD CONSTRAINT agency_client_relationships_source_workspace_matches_tenant
      CHECK (source_workspace_id IS NULL OR source_workspace_id = tenant_id);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_agency_talent_roster_source_workspace_id
  ON public.agency_talent_roster (source_workspace_id)
  WHERE source_workspace_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agency_talent_roster_origin_domain
  ON public.agency_talent_roster (origin_domain)
  WHERE origin_domain IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agency_client_relationships_source_workspace_id
  ON public.agency_client_relationships (source_workspace_id)
  WHERE source_workspace_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agency_client_relationships_origin_domain
  ON public.agency_client_relationships (origin_domain)
  WHERE origin_domain IS NOT NULL;

CREATE OR REPLACE FUNCTION public.relationship_source_defaults()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.source_workspace_id IS NULL THEN
    NEW.source_workspace_id := NEW.tenant_id;
  END IF;

  IF NEW.origin_domain IS NOT NULL THEN
    NEW.origin_domain := NULLIF(lower(trim(NEW.origin_domain)), '');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agency_talent_roster_source_defaults ON public.agency_talent_roster;
CREATE TRIGGER trg_agency_talent_roster_source_defaults
  BEFORE INSERT OR UPDATE ON public.agency_talent_roster
  FOR EACH ROW EXECUTE FUNCTION public.relationship_source_defaults();

DROP TRIGGER IF EXISTS trg_agency_client_relationships_source_defaults ON public.agency_client_relationships;
CREATE TRIGGER trg_agency_client_relationships_source_defaults
  BEFORE INSERT OR UPDATE ON public.agency_client_relationships
  FOR EACH ROW EXECUTE FUNCTION public.relationship_source_defaults();

UPDATE public.agency_talent_roster
SET source_workspace_id = tenant_id
WHERE source_workspace_id IS NULL;

UPDATE public.agency_client_relationships
SET source_workspace_id = tenant_id
WHERE source_workspace_id IS NULL;

COMMENT ON COLUMN public.agency_talent_roster.source_workspace_id IS
  'F3 source attribution: workspace context that created this roster relationship. Defaults to tenant_id.';
COMMENT ON COLUMN public.agency_talent_roster.origin_domain IS
  'F3 source attribution: hostname where this relationship was created (if known).';

COMMENT ON COLUMN public.agency_client_relationships.source_workspace_id IS
  'F3 source attribution: workspace context that created this client relationship. Defaults to tenant_id.';
COMMENT ON COLUMN public.agency_client_relationships.origin_domain IS
  'F3 source attribution: hostname where this relationship was created (if known).';

COMMIT;
