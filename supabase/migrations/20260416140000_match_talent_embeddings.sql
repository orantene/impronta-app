-- Phase 9: vector ANN + RPC for hybrid AI search (called with service role from app server).

CREATE INDEX IF NOT EXISTS talent_embeddings_hnsw_cosine
  ON public.talent_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

COMMENT ON INDEX public.talent_embeddings_hnsw_cosine IS
  'ANN index for semantic search; rebuild if embedding model/dims change.';

CREATE OR REPLACE FUNCTION public.match_talent_embeddings(
  p_query_embedding vector(1536),
  p_match_count int DEFAULT 80
)
RETURNS TABLE (talent_profile_id uuid, distance float4)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    te.talent_profile_id,
    (te.embedding <=> p_query_embedding)::float4 AS distance
  FROM public.talent_embeddings te
  INNER JOIN public.talent_profiles tp ON tp.id = te.talent_profile_id
  WHERE tp.deleted_at IS NULL
    AND tp.workflow_status = 'approved'
    AND tp.visibility = 'public'
  ORDER BY te.embedding <=> p_query_embedding
  LIMIT LEAST(GREATEST(p_match_count, 1), 200);
$$;

REVOKE ALL ON FUNCTION public.match_talent_embeddings(vector, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_talent_embeddings(vector, int) TO service_role;
