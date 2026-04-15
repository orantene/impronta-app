-- Optional persisted canonical text for embeddings / admin preview (Phase 4.5).
-- Regeneration strategy: see docs/ai-refresh-strategy.md; populated by worker or backfill.

BEGIN;

ALTER TABLE public.talent_profiles
  ADD COLUMN IF NOT EXISTS ai_search_document TEXT;

COMMENT ON COLUMN public.talent_profiles.ai_search_document IS
  'Deterministic plain-text from buildAiSearchDocument(); optional cache for embedding jobs and staff preview.';

COMMIT;
