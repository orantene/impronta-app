-- workspace_pages & workspace_page_revisions
-- Phase C page builder. Separate from cms_pages (site-admin system).
-- RLS: tenant staff can CRUD; anon can read published pages.

BEGIN;

CREATE TABLE IF NOT EXISTS public.workspace_pages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  slug          text NOT NULL,
  title         text NOT NULL DEFAULT 'Untitled',
  status        text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'scheduled', 'published')),
  blocks        jsonb NOT NULL DEFAULT '[]'::jsonb,
  theme         jsonb NOT NULL DEFAULT '{}'::jsonb,
  published_at  timestamptz,
  scheduled_for timestamptz,
  created_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspace_pages_tenant_slug_key UNIQUE (tenant_id, slug)
);

CREATE TABLE IF NOT EXISTS public.workspace_page_revisions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id     uuid NOT NULL REFERENCES public.workspace_pages(id) ON DELETE CASCADE,
  blocks      jsonb NOT NULL DEFAULT '[]'::jsonb,
  theme       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Auto-revision trigger
CREATE OR REPLACE FUNCTION public.workspace_pages_autosave_revision()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.workspace_page_revisions (page_id, blocks, theme, created_by)
  VALUES (OLD.id, OLD.blocks, OLD.theme, OLD.created_by);
  RETURN NEW;
END;
$$;

CREATE TRIGGER workspace_pages_autosave
  AFTER UPDATE ON public.workspace_pages
  FOR EACH ROW EXECUTE FUNCTION public.workspace_pages_autosave_revision();

-- RLS
ALTER TABLE public.workspace_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_page_revisions ENABLE ROW LEVEL SECURITY;

-- Staff: full access
CREATE POLICY workspace_pages_staff ON public.workspace_pages
  FOR ALL
  USING  (public.is_staff_of_tenant(tenant_id))
  WITH CHECK (public.is_staff_of_tenant(tenant_id));

-- Anonymous: read published only
CREATE POLICY workspace_pages_public ON public.workspace_pages
  FOR SELECT
  USING (status = 'published');

-- Revisions: staff only (no anon access)
CREATE POLICY workspace_page_revisions_staff ON public.workspace_page_revisions
  FOR ALL
  USING  (EXISTS (
    SELECT 1 FROM public.workspace_pages p
    WHERE p.id = page_id AND public.is_staff_of_tenant(p.tenant_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.workspace_pages p
    WHERE p.id = page_id AND public.is_staff_of_tenant(p.tenant_id)
  ));

COMMIT;
