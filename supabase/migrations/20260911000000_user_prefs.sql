-- Phase 5 — user_prefs table for hybrid-mode toggle persistence and first-run tips.
--
-- Stores per-user surface preferences. Intentionally minimal — only the fields
-- needed by Phase 5. Future prefs (notification settings, locale, density) can
-- add columns here rather than creating a new table.

CREATE TABLE IF NOT EXISTS public.user_prefs (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  preferred_surface TEXT CHECK (preferred_surface IN ('talent', 'workspace')),
  first_run_toggle_tip_seen BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: each user can read and write only their own row.
ALTER TABLE public.user_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_prefs_self_select"
  ON public.user_prefs
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "user_prefs_self_insert"
  ON public.user_prefs
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_prefs_self_update"
  ON public.user_prefs
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- updated_at auto-refresh trigger
CREATE OR REPLACE FUNCTION public.touch_user_prefs_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER user_prefs_updated_at
  BEFORE UPDATE ON public.user_prefs
  FOR EACH ROW EXECUTE FUNCTION public.touch_user_prefs_updated_at();
