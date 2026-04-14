-- AI directory search interpreter logs (service-role inserts; staff read via RLS in a later migration).
CREATE TABLE IF NOT EXISTS public.ai_search_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  raw_query text,
  normalized_summary text,

  taxonomy_term_ids uuid[],
  location_slug text,

  height_min_cm int,
  height_max_cm int,

  locale text,

  used_interpreter boolean DEFAULT false,

  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_search_logs_created_at_idx
  ON public.ai_search_logs (created_at DESC);

ALTER TABLE public.ai_search_logs ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.ai_search_logs IS
  'AI interpret-search events; inserts via SUPABASE_SERVICE_ROLE_KEY only.';
