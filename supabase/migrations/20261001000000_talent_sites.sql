-- Talent Max personal sites — dedicated storage (not tenant cms_* tables).

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_talent_profile_owner(profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.talent_profiles tp
    WHERE tp.id = profile_id
      AND tp.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.talent_profile_has_max(profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.talent_profiles tp
    WHERE tp.id = profile_id
      AND tp.talent_plan_key = 'talent_portfolio'
  );
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE public.talent_sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  talent_profile_id uuid NOT NULL UNIQUE REFERENCES public.talent_profiles (id) ON DELETE CASCADE,
  site_kind text NOT NULL DEFAULT 'talent_personal'
    CHECK (site_kind = 'talent_personal'),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'unpublished', 'archived')),
  draft_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  published_snapshot jsonb,
  version integer NOT NULL DEFAULT 1,
  draft_updated_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  unpublished_at timestamptz,
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_talent_sites_talent_profile_id ON public.talent_sites (talent_profile_id);
CREATE INDEX idx_talent_sites_status ON public.talent_sites (status);

CREATE TABLE public.talent_site_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  talent_site_id uuid NOT NULL REFERENCES public.talent_sites (id) ON DELETE CASCADE,
  talent_profile_id uuid NOT NULL REFERENCES public.talent_profiles (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('draft', 'published', 'unpublished')),
  version integer NOT NULL,
  snapshot jsonb NOT NULL,
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_talent_site_revisions_site_created
  ON public.talent_site_revisions (talent_site_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.talent_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.talent_site_revisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY talent_sites_owner_select ON public.talent_sites
  FOR SELECT
  USING (public.is_talent_profile_owner(talent_profile_id));

CREATE POLICY talent_sites_owner_insert ON public.talent_sites
  FOR INSERT
  WITH CHECK (
    public.is_talent_profile_owner(talent_profile_id)
    AND public.talent_profile_has_max(talent_profile_id)
  );

CREATE POLICY talent_sites_owner_update ON public.talent_sites
  FOR UPDATE
  USING (
    public.is_talent_profile_owner(talent_profile_id)
    AND public.talent_profile_has_max(talent_profile_id)
  )
  WITH CHECK (
    public.is_talent_profile_owner(talent_profile_id)
    AND public.talent_profile_has_max(talent_profile_id)
  );

CREATE POLICY talent_site_revisions_owner_select ON public.talent_site_revisions
  FOR SELECT
  USING (public.is_talent_profile_owner(talent_profile_id));

CREATE POLICY talent_site_revisions_owner_insert ON public.talent_site_revisions
  FOR INSERT
  WITH CHECK (
    public.is_talent_profile_owner(talent_profile_id)
    AND public.talent_profile_has_max(talent_profile_id)
  );

-- ---------------------------------------------------------------------------
-- Public read RPC (published snapshot only; no draft exposure)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.talent_public_site_for_profile_code(p_profile_code text)
RETURNS TABLE (
  profile_code text,
  talent_profile_id uuid,
  published_snapshot jsonb,
  published_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    tp.profile_code,
    tp.id AS talent_profile_id,
    ts.published_snapshot,
    ts.published_at
  FROM public.talent_profiles tp
  INNER JOIN public.talent_sites ts ON ts.talent_profile_id = tp.id
  WHERE tp.profile_code = p_profile_code
    AND tp.is_publicly_hidden = false
    AND ts.status = 'published'
    AND ts.published_snapshot IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION public.talent_public_site_for_profile_code(text) TO anon, authenticated;
