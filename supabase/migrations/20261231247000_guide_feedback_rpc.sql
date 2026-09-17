-- Support Guide P1 — usage signals without opening a write policy.
--
-- Authenticated users never UPDATE guide_articles directly (no policy, on
-- purpose). This SECURITY DEFINER function is the only write path: it can
-- bump the four counters and nothing else. helpful_no / search_count feed
-- the gap radar (scripts/guide/guide-digest.mjs) and the automatic redraft
-- rule in the plan (§3b: "Not really" twice in 7 days → redraft).
--
-- Rollback: DROP FUNCTION public.guide_article_signal(text, text, text).

BEGIN;

CREATE OR REPLACE FUNCTION public.guide_article_signal(
  p_node_id TEXT,
  p_locale TEXT,
  p_signal TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'guide_article_signal: not signed in' USING ERRCODE = '42501';
  END IF;
  IF p_locale NOT IN ('en', 'es') THEN
    RAISE EXCEPTION 'guide_article_signal: bad locale' USING ERRCODE = '22023';
  END IF;

  IF p_signal = 'helpful_yes' THEN
    UPDATE public.guide_articles SET helpful_yes = helpful_yes + 1 WHERE node_id = p_node_id AND locale = p_locale;
  ELSIF p_signal = 'helpful_no' THEN
    UPDATE public.guide_articles SET helpful_no = helpful_no + 1 WHERE node_id = p_node_id AND locale = p_locale;
  ELSIF p_signal = 'open' THEN
    UPDATE public.guide_articles SET open_count = open_count + 1 WHERE node_id = p_node_id AND locale = p_locale;
  ELSIF p_signal = 'search' THEN
    UPDATE public.guide_articles SET search_count = search_count + 1 WHERE node_id = p_node_id AND locale = p_locale;
  ELSE
    RAISE EXCEPTION 'guide_article_signal: bad signal' USING ERRCODE = '22023';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.guide_article_signal(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guide_article_signal(text, text, text) TO authenticated;

-- No-result searches are the other half of the gap radar: what people
-- looked for that no article matched.
CREATE TABLE IF NOT EXISTS public.guide_search_misses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  locale TEXT NOT NULL CHECK (locale IN ('en', 'es')),
  query TEXT NOT NULL CHECK (char_length(query) BETWEEN 2 AND 120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS guide_search_misses_created_at_idx ON public.guide_search_misses(created_at DESC);
ALTER TABLE public.guide_search_misses ENABLE ROW LEVEL SECURITY;
-- Write-only for users via the function below; nobody reads it but the digest (service role).

CREATE OR REPLACE FUNCTION public.guide_search_miss(p_locale TEXT, p_query TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'guide_search_miss: not signed in' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.guide_search_misses (locale, query) VALUES (p_locale, left(btrim(p_query), 120));
END;
$$;

REVOKE ALL ON FUNCTION public.guide_search_miss(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guide_search_miss(text, text) TO authenticated;

COMMIT;
