-- ============================================================================
-- Inquiry ↔ Skill Link V1 — 2026-05-07
-- ============================================================================
--
-- WHY
-- ───
-- When a client creates an inquiry ("Fire Performer for wedding in Tulum"),
-- the requested skill should be recorded so:
--   - Search/discovery can rank talent better for that brief
--   - Reports can answer "What skills are most-requested this quarter?"
--   - Booking analytics can attribute completed bookings to specific skills
--   - The matching engine can filter pre-claimed talent by relevant skills
--
-- WHAT
-- ────
-- Adds 2 columns to inquiries:
--   - requested_skill_term_id UUID — FK to taxonomy_terms (typically a level-3 talent_type)
--   - requested_proficiency_min TEXT — beginner..master (CHECK)
--
-- Both nullable — pre-existing inquiries don't break, and clients can leave
-- the proficiency field unset if they don't have a strong preference.
-- ============================================================================

BEGIN;

ALTER TABLE public.inquiries
  ADD COLUMN IF NOT EXISTS requested_skill_term_id UUID REFERENCES public.taxonomy_terms(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS requested_proficiency_min TEXT
    CHECK (requested_proficiency_min IS NULL OR requested_proficiency_min IN
      ('beginner','intermediate','advanced','expert','master'));

COMMENT ON COLUMN public.inquiries.requested_skill_term_id IS
  'The specific talent_type the client is requesting (e.g., Fire Performer term_id). NULL when client provides a free-text brief without a structured pick. Powers skill-aware matching + analytics.';

COMMENT ON COLUMN public.inquiries.requested_proficiency_min IS
  'Optional minimum proficiency level the client wants. Search filters with proficiency >= this value. NULL = no preference.';

-- Index for filtering inquiries by skill in admin dashboards.
CREATE INDEX IF NOT EXISTS idx_inquiries_requested_skill
  ON public.inquiries (requested_skill_term_id)
  WHERE requested_skill_term_id IS NOT NULL;

DO $$
DECLARE
  v_col_count INT;
BEGIN
  SELECT count(*) INTO v_col_count
  FROM information_schema.columns
  WHERE table_name = 'inquiries' AND table_schema = 'public'
    AND column_name IN ('requested_skill_term_id', 'requested_proficiency_min');
  IF v_col_count <> 2 THEN
    RAISE EXCEPTION 'inquiry_skill_link_v1: expected 2 new columns, got %', v_col_count;
  END IF;
  RAISE NOTICE 'inquiry_skill_link_v1: 2 new columns + index installed.';
END $$;

COMMIT;
