-- Theme releases: an immutable payload snapshot per built-in Design version.
-- The catalog keeps only the CURRENT payload, so a site pinned to an older
-- version had no exact merge base. Written by syncBuiltinTalentThemes on every
-- version bump; read by the stamp backfill and the merge engine.
-- Additive only. Service-role writes; no talent access (payloads are not
-- secret, but nothing client-side needs them).

CREATE TABLE IF NOT EXISTS public.talent_theme_versions (
  design text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  payload jsonb NOT NULL,
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT talent_theme_versions_pkey PRIMARY KEY (design, version)
);

ALTER TABLE public.talent_theme_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.talent_theme_versions FROM anon;
REVOKE ALL ON public.talent_theme_versions FROM authenticated;
