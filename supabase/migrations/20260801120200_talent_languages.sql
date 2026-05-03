-- Talent languages — structured language data per talent profile.
--
-- Today languages exist in two places:
--   - taxonomy_terms(kind='language') as a vocabulary list (en, es, pt, …)
--   - talent_profiles.languages TEXT[] (M8 editorial: flat name list)
--
-- Neither captures proficiency or service capability. AI search and the
-- inquiry router need to know "can this person host VIP guests in English?"
-- That requires speaking_level + can_host + can_sell + can_translate +
-- can_teach.
--
-- Strategy mirrors talent_service_areas:
--   - talent_languages becomes the canonical structured table.
--   - talent_profiles.languages TEXT[] stays as a derived denormalized cache,
--     refreshed by a trigger so existing M8 code keeps reading it without
--     rewrite.
--   - Backfill (next migration) seeds rows from talent_profiles.languages
--     and from legacy talent_profile_taxonomy assignments where the term
--     kind='language'.
--
-- Trigger ships ENABLED but the backfill migration disables it briefly to
-- avoid N updates per profile, then re-enables it and runs a final resync.
--
-- DOWN (manual):
--   DROP TRIGGER IF EXISTS trg_talent_languages_refresh_cache ON public.talent_languages;
--   DROP TRIGGER IF EXISTS trg_talent_languages_touch_updated_at ON public.talent_languages;
--   DROP FUNCTION IF EXISTS public.refresh_talent_profile_languages_cache();
--   DROP FUNCTION IF EXISTS public.talent_languages_touch_updated_at();
--   DROP TABLE IF EXISTS public.talent_languages;

BEGIN;

CREATE TABLE IF NOT EXISTS public.talent_languages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.agencies(id) ON DELETE CASCADE,
  talent_profile_id UUID NOT NULL REFERENCES public.talent_profiles(id) ON DELETE CASCADE,
  language_code TEXT NOT NULL,
  language_name TEXT NOT NULL,
  speaking_level TEXT NOT NULL DEFAULT 'conversational'
    CHECK (speaking_level IN ('basic','conversational','professional','fluent','native')),
  reading_level TEXT
    CHECK (reading_level IS NULL OR reading_level IN ('basic','conversational','professional','fluent','native')),
  writing_level TEXT
    CHECK (writing_level IS NULL OR writing_level IN ('basic','conversational','professional','fluent','native')),
  is_native BOOLEAN NOT NULL DEFAULT FALSE,
  can_host BOOLEAN NOT NULL DEFAULT FALSE,
  can_sell BOOLEAN NOT NULL DEFAULT FALSE,
  can_translate BOOLEAN NOT NULL DEFAULT FALSE,
  can_teach BOOLEAN NOT NULL DEFAULT FALSE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (talent_profile_id, language_code)
);

CREATE INDEX IF NOT EXISTS idx_talent_languages_profile
  ON public.talent_languages (talent_profile_id);

CREATE INDEX IF NOT EXISTS idx_talent_languages_code_speaking
  ON public.talent_languages (language_code, speaking_level);

CREATE INDEX IF NOT EXISTS idx_talent_languages_can_host
  ON public.talent_languages (talent_profile_id, language_code)
  WHERE can_host = TRUE;

CREATE INDEX IF NOT EXISTS idx_talent_languages_can_sell
  ON public.talent_languages (talent_profile_id, language_code)
  WHERE can_sell = TRUE;

CREATE INDEX IF NOT EXISTS idx_talent_languages_tenant
  ON public.talent_languages (tenant_id)
  WHERE tenant_id IS NOT NULL;

-- ─── updated_at trigger ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.talent_languages_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_talent_languages_touch_updated_at
  ON public.talent_languages;

CREATE TRIGGER trg_talent_languages_touch_updated_at
  BEFORE UPDATE ON public.talent_languages
  FOR EACH ROW EXECUTE FUNCTION public.talent_languages_touch_updated_at();

-- ─── languages[] cache refresh trigger ─────────────────────────────────────
-- Refreshes talent_profiles.languages as the array of language_name values
-- ordered by display_order then language_name. Keeps M8 editorial code
-- working without rewrite.
CREATE OR REPLACE FUNCTION public.refresh_talent_profile_languages_cache()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  affected_profile UUID;
BEGIN
  affected_profile := COALESCE(NEW.talent_profile_id, OLD.talent_profile_id);

  UPDATE public.talent_profiles AS tp
     SET languages = COALESCE((
           SELECT array_agg(language_name ORDER BY display_order, language_name)
             FROM public.talent_languages
            WHERE talent_profile_id = affected_profile
         ), ARRAY[]::TEXT[])
   WHERE tp.id = affected_profile;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_talent_languages_refresh_cache
  ON public.talent_languages;

CREATE TRIGGER trg_talent_languages_refresh_cache
  AFTER INSERT OR UPDATE OR DELETE ON public.talent_languages
  FOR EACH ROW EXECUTE FUNCTION public.refresh_talent_profile_languages_cache();

-- ─── RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE public.talent_languages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS talent_languages_select_public ON public.talent_languages;
CREATE POLICY talent_languages_select_public ON public.talent_languages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.talent_profiles tp
       WHERE tp.id = talent_languages.talent_profile_id
         AND tp.deleted_at IS NULL
         AND tp.workflow_status = 'approved'
         AND tp.visibility = 'public'
    )
  );

DROP POLICY IF EXISTS talent_languages_select_own ON public.talent_languages;
CREATE POLICY talent_languages_select_own ON public.talent_languages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.talent_profiles tp
       WHERE tp.id = talent_languages.talent_profile_id
         AND tp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS talent_languages_select_staff ON public.talent_languages;
CREATE POLICY talent_languages_select_staff ON public.talent_languages
  FOR SELECT
  USING (
    public.is_agency_staff()
    OR (tenant_id IS NOT NULL AND public.is_staff_of_tenant(tenant_id))
  );

DROP POLICY IF EXISTS talent_languages_write_own_or_staff ON public.talent_languages;
CREATE POLICY talent_languages_write_own_or_staff ON public.talent_languages
  FOR ALL
  USING (
    public.is_agency_staff()
    OR (tenant_id IS NOT NULL AND public.is_staff_of_tenant(tenant_id))
    OR EXISTS (
      SELECT 1 FROM public.talent_profiles tp
       WHERE tp.id = talent_languages.talent_profile_id
         AND tp.user_id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_agency_staff()
    OR (tenant_id IS NOT NULL AND public.is_staff_of_tenant(tenant_id))
    OR EXISTS (
      SELECT 1 FROM public.talent_profiles tp
       WHERE tp.id = talent_languages.talent_profile_id
         AND tp.user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.talent_languages IS
  'Structured language record per talent. Canonical source. talent_profiles.languages TEXT[] is a derived cache refreshed by trigger.';
COMMENT ON COLUMN public.talent_languages.language_code IS
  'ISO 639-1 lowercase code (en, es, pt, fr, it, de). Lower-cased by client; not enforced here.';
COMMENT ON COLUMN public.talent_languages.speaking_level IS
  'Spoken proficiency. basic | conversational | professional | fluent | native.';
COMMENT ON COLUMN public.talent_languages.can_host IS
  'Talent can host guests / events in this language at a professional level.';
COMMENT ON COLUMN public.talent_languages.can_sell IS
  'Talent can sell / pitch products in this language (luxury sales, brand activations, etc.).';
COMMENT ON COLUMN public.talent_languages.can_translate IS
  'Talent offers translation services.';
COMMENT ON COLUMN public.talent_languages.can_teach IS
  'Talent offers teaching / language instruction services.';

COMMIT;
