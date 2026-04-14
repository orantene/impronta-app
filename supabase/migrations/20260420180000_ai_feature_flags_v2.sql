-- Post-AI quality: v2 rollout flags (default off). Read by getAiFeatureFlags().
INSERT INTO public.settings (key, value, updated_at)
VALUES
  ('ai_search_quality_v2', 'false'::jsonb, now()),
  ('ai_refine_v2', 'false'::jsonb, now()),
  ('ai_explanations_v2', 'false'::jsonb, now())
ON CONFLICT (key) DO NOTHING;
