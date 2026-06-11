-- talent_pages & talent_page_revisions
-- WS6 page builder. Mirrors workspace_pages exactly, keyed to talent_profile_id
-- instead of tenant_id. RLS: talent owner can CRUD their own pages;
-- anon can read published pages. plan/tier gating is enforced server-side
-- in the talent-page-adapter (required_talent_tier = Max / talent_portfolio).

BEGIN;

CREATE TABLE IF NOT EXISTS public.talent_pages (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  talent_profile_id   uuid NOT NULL REFERENCES public.talent_profiles(id) ON DELETE CASCADE,
  slug                text NOT NULL,
  title               text NOT NULL DEFAULT 'Untitled',
  status              text NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft', 'scheduled', 'published')),
  -- freeform builderTree JSON — the ONLY persistence target for WS6 freeform writes.
  -- NEVER write cms_page_sections / composition[] from this table.
  blocks              jsonb NOT NULL DEFAULT '[]'::jsonb,
  theme               jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- required_talent_tier mirrors builder_templates.required_talent_tier:
  -- null = any tier; 'talent_pro' / 'talent_portfolio' = tier-gated.
  -- Enforced server-side in the adapter; stored here as a signal for RLS futures.
  required_talent_tier text,
  published_at        timestamptz,
  scheduled_for       timestamptz,
  created_by          uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT talent_pages_profile_slug_key UNIQUE (talent_profile_id, slug)
);

CREATE TABLE IF NOT EXISTS public.talent_page_revisions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id           uuid NOT NULL REFERENCES public.talent_pages(id) ON DELETE CASCADE,
  blocks            jsonb NOT NULL DEFAULT '[]'::jsonb,
  theme             jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Auto-revision trigger (mirrors workspace_pages pattern)
CREATE OR REPLACE FUNCTION public.talent_pages_autosave_revision()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.talent_page_revisions (page_id, blocks, theme, created_by)
  VALUES (OLD.id, OLD.blocks, OLD.theme, OLD.created_by);
  RETURN NEW;
END;
$$;

CREATE TRIGGER talent_pages_autosave
  AFTER UPDATE ON public.talent_pages
  FOR EACH ROW EXECUTE FUNCTION public.talent_pages_autosave_revision();

-- RLS
ALTER TABLE public.talent_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.talent_page_revisions ENABLE ROW LEVEL SECURITY;

-- Talent owner: full access to their own pages (via profiles.id = talent_profiles.profile_id)
CREATE POLICY talent_pages_owner ON public.talent_pages
  FOR ALL
  USING  (
    EXISTS (
      SELECT 1 FROM public.talent_profiles tp
      JOIN public.profiles p ON p.id = tp.profile_id
      WHERE tp.id = talent_profile_id
        AND p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.talent_profiles tp
      JOIN public.profiles p ON p.id = tp.profile_id
      WHERE tp.id = talent_profile_id
        AND p.user_id = auth.uid()
    )
  );

-- Workspace staff: read + write access (agency staff managing talent pages)
CREATE POLICY talent_pages_staff ON public.talent_pages
  FOR ALL
  USING  (
    EXISTS (
      SELECT 1 FROM public.talent_profiles tp
      WHERE tp.id = talent_profile_id
        AND public.is_staff_of_tenant(tp.agency_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.talent_profiles tp
      WHERE tp.id = talent_profile_id
        AND public.is_staff_of_tenant(tp.agency_id)
    )
  );

-- Anonymous: read published only
CREATE POLICY talent_pages_public ON public.talent_pages
  FOR SELECT
  USING (status = 'published');

-- Revisions: owner + staff only (no anon access)
CREATE POLICY talent_page_revisions_owner ON public.talent_page_revisions
  FOR ALL
  USING  (EXISTS (
    SELECT 1 FROM public.talent_pages p
    JOIN public.talent_profiles tp ON tp.id = p.talent_profile_id
    JOIN public.profiles prof ON prof.id = tp.profile_id
    WHERE p.id = page_id
      AND prof.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.talent_pages p
    JOIN public.talent_profiles tp ON tp.id = p.talent_profile_id
    JOIN public.profiles prof ON prof.id = tp.profile_id
    WHERE p.id = page_id
      AND prof.user_id = auth.uid()
  ));

CREATE POLICY talent_page_revisions_staff ON public.talent_page_revisions
  FOR ALL
  USING  (EXISTS (
    SELECT 1 FROM public.talent_pages p
    JOIN public.talent_profiles tp ON tp.id = p.talent_profile_id
    WHERE p.id = page_id
      AND public.is_staff_of_tenant(tp.agency_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.talent_pages p
    JOIN public.talent_profiles tp ON tp.id = p.talent_profile_id
    WHERE p.id = page_id
      AND public.is_staff_of_tenant(tp.agency_id)
  ));

COMMIT;
