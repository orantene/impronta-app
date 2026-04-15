-- Symmetric bilingual bio: English draft + per-locale status (reuses bio_es_status enum).

BEGIN;

ALTER TABLE public.talent_profiles
  ADD COLUMN IF NOT EXISTS bio_en_draft TEXT,
  ADD COLUMN IF NOT EXISTS bio_en_status public.bio_es_status NOT NULL DEFAULT 'missing';

COMMENT ON COLUMN public.talent_profiles.bio_en_draft IS 'Draft English bio when bio_en_status is approved/locked; promoted to bio_en/short_bio.';
COMMENT ON COLUMN public.talent_profiles.bio_en_status IS 'Lifecycle for English published bio (same enum as Spanish): missing, auto, reviewed, approved, stale.';

UPDATE public.talent_profiles
SET bio_en_status = CASE
  WHEN trim(coalesce(bio_en, short_bio, '')) = '' THEN 'missing'::public.bio_es_status
  ELSE 'reviewed'::public.bio_es_status
END;

COMMIT;
