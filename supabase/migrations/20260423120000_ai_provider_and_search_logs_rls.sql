-- Default chat provider (OpenAI). Admins can switch to anthropic via AI Settings.
INSERT INTO public.settings (key, value, updated_at)
VALUES ('ai_provider', to_jsonb('openai'::text), now())
ON CONFLICT (key) DO NOTHING;

-- Staff can read AI interpret-search logs in admin UI.
DROP POLICY IF EXISTS ai_search_logs_select_staff ON public.ai_search_logs;
CREATE POLICY ai_search_logs_select_staff ON public.ai_search_logs
  FOR SELECT
  TO authenticated
  USING (public.is_agency_staff());
