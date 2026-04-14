-- Lean v1 revisions for cms_pages + cms_posts (Chunk 2 follow-on).
-- Snapshots store editor fields only (JSONB); staff-only RLS.

BEGIN;

DO $$
BEGIN
  CREATE TYPE public.cms_revision_kind AS ENUM ('draft', 'published');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE public.cms_page_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID NOT NULL REFERENCES public.cms_pages (id) ON DELETE CASCADE,
  kind public.cms_revision_kind NOT NULL,
  snapshot JSONB NOT NULL,
  created_by UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cms_page_revisions_page_created
  ON public.cms_page_revisions (page_id, created_at DESC);

CREATE TABLE public.cms_post_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.cms_posts (id) ON DELETE CASCADE,
  kind public.cms_revision_kind NOT NULL,
  snapshot JSONB NOT NULL,
  created_by UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cms_post_revisions_post_created
  ON public.cms_post_revisions (post_id, created_at DESC);

ALTER TABLE public.cms_page_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cms_post_revisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY cms_page_revisions_staff_all ON public.cms_page_revisions
  FOR ALL
  USING (public.is_agency_staff())
  WITH CHECK (public.is_agency_staff());

CREATE POLICY cms_post_revisions_staff_all ON public.cms_post_revisions
  FOR ALL
  USING (public.is_agency_staff())
  WITH CHECK (public.is_agency_staff());

COMMENT ON TABLE public.cms_page_revisions IS 'Point-in-time editable field snapshots for cms_pages (draft vs publish).';
COMMENT ON TABLE public.cms_post_revisions IS 'Point-in-time editable field snapshots for cms_posts (draft vs publish).';

COMMIT;
