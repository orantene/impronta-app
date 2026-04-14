-- Idempotent upgrade: older ai_search_logs definitions used jsonb columns; the app now uses flat columns.
-- Safe no-op when 20260421200000_ai_search_logs.sql already created this shape.
DO $mig$
BEGIN
  IF to_regclass('public.ai_search_logs') IS NULL THEN
    RETURN;
  END IF;
  ALTER TABLE public.ai_search_logs ADD COLUMN IF NOT EXISTS normalized_summary text;
  ALTER TABLE public.ai_search_logs ADD COLUMN IF NOT EXISTS taxonomy_term_ids uuid[];
  ALTER TABLE public.ai_search_logs ADD COLUMN IF NOT EXISTS location_slug text;
  ALTER TABLE public.ai_search_logs ADD COLUMN IF NOT EXISTS height_min_cm int;
  ALTER TABLE public.ai_search_logs ADD COLUMN IF NOT EXISTS height_max_cm int;
  ALTER TABLE public.ai_search_logs ADD COLUMN IF NOT EXISTS used_interpreter boolean DEFAULT false;
END $mig$;
