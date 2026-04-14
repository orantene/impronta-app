-- Phase C: search analytics + AI forward fields
-- Phase 9 prep: pgvector + talent_embeddings + default AI flags (all off)

BEGIN;

CREATE EXTENSION IF NOT EXISTS vector;

-- ---------------------------------------------------------------------------
-- search_queries
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.search_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query TEXT,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  results_count INT NOT NULL DEFAULT 0,
  clicked_talent_id UUID REFERENCES public.talent_profiles (id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'directory',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  session_id TEXT,
  user_id UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  search_mode TEXT,
  ai_enabled BOOLEAN,
  rerank_enabled BOOLEAN,
  explanation_enabled BOOLEAN,
  intent TEXT,
  ai_path_requested TEXT,
  fallback_triggered BOOLEAN,
  fallback_reason TEXT,
  flag_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_search_queries_created_at
  ON public.search_queries (created_at DESC);

ALTER TABLE public.search_queries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS search_queries_insert_public ON public.search_queries;
CREATE POLICY search_queries_insert_public ON public.search_queries
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS search_queries_select_staff ON public.search_queries;
CREATE POLICY search_queries_select_staff ON public.search_queries
  FOR SELECT
  USING (public.is_agency_staff());

-- ---------------------------------------------------------------------------
-- talent_embeddings (Phase 9+)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.talent_embeddings (
  talent_profile_id UUID PRIMARY KEY REFERENCES public.talent_profiles (id) ON DELETE CASCADE,
  embedding vector(1536) NOT NULL,
  embedding_model TEXT NOT NULL,
  embedding_version TEXT NOT NULL,
  document_hash TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ANN index (ivfflat / hnsw): add after embeddings are backfilled — empty tables are fine without it.

ALTER TABLE public.talent_embeddings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS talent_embeddings_staff_all ON public.talent_embeddings;
CREATE POLICY talent_embeddings_staff_all ON public.talent_embeddings
  FOR ALL
  USING (public.is_agency_staff())
  WITH CHECK (public.is_agency_staff());

-- ---------------------------------------------------------------------------
-- AI feature flags (defaults off; server reads via service role)
-- ---------------------------------------------------------------------------
INSERT INTO public.settings (key, value, updated_at)
VALUES
  ('ai_search_enabled', 'false'::jsonb, now()),
  ('ai_rerank_enabled', 'false'::jsonb, now()),
  ('ai_explanations_enabled', 'false'::jsonb, now()),
  ('ai_refine_enabled', 'false'::jsonb, now()),
  ('ai_draft_enabled', 'false'::jsonb, now())
ON CONFLICT (key) DO NOTHING;

COMMIT;
