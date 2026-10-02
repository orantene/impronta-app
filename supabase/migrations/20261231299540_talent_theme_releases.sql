-- Theme releases (Phase 1B): staged design releases + per-site update state.
-- Additive only. Writes are service-role; talents read published opt-in/default
-- releases and may only move their own update rows to previewed/dismissed.

CREATE TABLE IF NOT EXISTS public.talent_theme_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  design_slug text NOT NULL,
  from_version integer NOT NULL,
  to_version integer NOT NULL,
  channel text NOT NULL DEFAULT 'draft'
    CHECK (channel IN ('draft', 'demos', 'optin', 'default')),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'paused', 'archived')),
  notes jsonb NOT NULL DEFAULT '{}'::jsonb,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  rollout_pct integer NOT NULL DEFAULT 0 CHECK (rollout_pct BETWEEN 0 AND 100),
  critical boolean NOT NULL DEFAULT false,
  dry_run_report jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT talent_theme_releases_design_to_version_key UNIQUE (design_slug, to_version)
);

CREATE INDEX IF NOT EXISTS idx_talent_theme_releases_design
  ON public.talent_theme_releases (design_slug, to_version DESC);

CREATE TABLE IF NOT EXISTS public.talent_site_theme_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  talent_site_id uuid NOT NULL REFERENCES public.talent_sites (id) ON DELETE CASCADE,
  talent_profile_id uuid NOT NULL REFERENCES public.talent_profiles (id) ON DELETE CASCADE,
  release_id uuid NOT NULL REFERENCES public.talent_theme_releases (id) ON DELETE CASCADE,
  state text NOT NULL DEFAULT 'available'
    CHECK (state IN ('available', 'previewed', 'applied', 'dismissed', 'undone')),
  report jsonb,
  applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT talent_site_theme_updates_site_release_key UNIQUE (talent_site_id, release_id)
);

CREATE INDEX IF NOT EXISTS idx_talent_site_theme_updates_profile
  ON public.talent_site_theme_updates (talent_profile_id);

ALTER TABLE public.talent_sites
  ADD COLUMN IF NOT EXISTS draft_rev integer NOT NULL DEFAULT 0;
ALTER TABLE public.talent_sites
  ADD COLUMN IF NOT EXISTS theme_token_origin jsonb;

ALTER TABLE public.talent_theme_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.talent_site_theme_updates ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.talent_theme_releases FROM anon;
REVOKE ALL ON public.talent_site_theme_updates FROM anon;
REVOKE ALL ON public.talent_theme_releases FROM authenticated;
REVOKE ALL ON public.talent_site_theme_updates FROM authenticated;
GRANT SELECT ON public.talent_theme_releases TO authenticated;
GRANT SELECT ON public.talent_site_theme_updates TO authenticated;
-- Column-scoped: an owner may touch only state + updated_at, never report/applied_at.
GRANT UPDATE (state, updated_at) ON public.talent_site_theme_updates TO authenticated;

DROP POLICY IF EXISTS talent_theme_releases_talent_select ON public.talent_theme_releases;
CREATE POLICY talent_theme_releases_talent_select ON public.talent_theme_releases
  FOR SELECT TO authenticated
  USING (status = 'published' AND channel IN ('optin', 'default'));

DROP POLICY IF EXISTS talent_site_theme_updates_owner_select ON public.talent_site_theme_updates;
CREATE POLICY talent_site_theme_updates_owner_select ON public.talent_site_theme_updates
  FOR SELECT TO authenticated
  USING (public.is_talent_profile_owner(talent_profile_id));

DROP POLICY IF EXISTS talent_site_theme_updates_owner_update ON public.talent_site_theme_updates;
CREATE POLICY talent_site_theme_updates_owner_update ON public.talent_site_theme_updates
  FOR UPDATE TO authenticated
  USING (public.is_talent_profile_owner(talent_profile_id))
  WITH CHECK (
    public.is_talent_profile_owner(talent_profile_id)
    AND state IN ('previewed', 'dismissed')
  );
