-- Taxonomy v2 — extend public.taxonomy_terms with a real hierarchy.
--
-- The existing flat shape (kind, slug, name_en, name_es, aliases, sort_order)
-- can no longer model real talent careers. A person is a primary role +
-- secondary roles + specialties + skills + contexts + languages, and the
-- directory needs to filter on parent categories that don't exist as kinds
-- yet.
--
-- This migration is **additive only**. All existing taxonomy_terms IDs and
-- live talent_profile_taxonomy assignments stay valid. No rename, no drop.
--
-- Strategy:
--   - Add hierarchy columns (parent_id, term_type, level) and presentation
--     metadata (plural_name, description, icon, is_active, is_public_filter,
--     is_profile_badge) and search aids (search_synonyms, ai_keywords).
--   - Add restricted-hub flags now (is_restricted, restriction_level) so
--     PR 2 can wire restricted hubs without a schema change.
--   - Backfill term_type from the existing kind column. Mapping:
--       talent_type -> talent_type
--       skill       -> skill
--       event_type  -> context
--       industry    -> context
--       fit_label   -> attribute
--       tag         -> attribute
--       language    -> language     (kept for transition; replaced by
--                                    public.talent_languages in a follow-up
--                                    migration)
--       location_city / location_country -> attribute (legacy import)
--   - Add a UNIQUE (term_type, slug) constraint for new hierarchical rows.
--     The original UNIQUE (kind, slug) stays — old rows still resolve by it.
--
-- DOWN (manual revert):
--   ALTER TABLE public.taxonomy_terms
--     DROP CONSTRAINT IF EXISTS taxonomy_terms_term_type_slug_uniq,
--     DROP COLUMN IF EXISTS parent_id,
--     DROP COLUMN IF EXISTS term_type,
--     DROP COLUMN IF EXISTS level,
--     DROP COLUMN IF EXISTS plural_name,
--     DROP COLUMN IF EXISTS description,
--     DROP COLUMN IF EXISTS icon,
--     DROP COLUMN IF EXISTS is_active,
--     DROP COLUMN IF EXISTS is_public_filter,
--     DROP COLUMN IF EXISTS is_profile_badge,
--     DROP COLUMN IF EXISTS is_restricted,
--     DROP COLUMN IF EXISTS restriction_level,
--     DROP COLUMN IF EXISTS search_synonyms,
--     DROP COLUMN IF EXISTS ai_keywords;

BEGIN;

ALTER TABLE public.taxonomy_terms
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.taxonomy_terms(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS term_type TEXT,
  ADD COLUMN IF NOT EXISTS level INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS plural_name TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS icon TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS is_public_filter BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_profile_badge BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS is_restricted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS restriction_level TEXT,
  ADD COLUMN IF NOT EXISTS search_synonyms TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS ai_keywords TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Backfill term_type from kind for legacy rows.
UPDATE public.taxonomy_terms
   SET term_type = CASE kind::text
                     WHEN 'talent_type'      THEN 'talent_type'
                     WHEN 'skill'            THEN 'skill'
                     WHEN 'event_type'       THEN 'context'
                     WHEN 'industry'         THEN 'context'
                     WHEN 'fit_label'        THEN 'attribute'
                     WHEN 'tag'              THEN 'attribute'
                     WHEN 'language'         THEN 'language'
                     WHEN 'location_city'    THEN 'attribute'
                     WHEN 'location_country' THEN 'attribute'
                     ELSE 'attribute'
                   END
 WHERE term_type IS NULL;

-- CHECK constraint on term_type values. Allowed values cover both v2 hierarchy
-- terms and legacy types still in use (so existing rows pass the check).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'taxonomy_terms_term_type_check'
      AND conrelid = 'public.taxonomy_terms'::regclass
  ) THEN
    ALTER TABLE public.taxonomy_terms
      ADD CONSTRAINT taxonomy_terms_term_type_check
      CHECK (term_type IN (
        -- v2 hierarchical types
        'parent_category',
        'category_group',
        'talent_type',
        'specialty',
        'skill_group',
        'skill',
        'context_group',
        'context',
        'credential',
        'attribute',
        -- legacy passthrough; preserved for transition
        'language'
      ));
  END IF;
END $$;

-- restriction_level values are advisory; only enforced when is_restricted=true.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'taxonomy_terms_restriction_level_check'
      AND conrelid = 'public.taxonomy_terms'::regclass
  ) THEN
    ALTER TABLE public.taxonomy_terms
      ADD CONSTRAINT taxonomy_terms_restriction_level_check
      CHECK (
        restriction_level IS NULL
        OR restriction_level IN ('age_18','age_21','identity_verified','manual_review')
      );
  END IF;
END $$;

-- Once term_type is populated for all rows, mark it NOT NULL.
ALTER TABLE public.taxonomy_terms
  ALTER COLUMN term_type SET NOT NULL;

-- Hierarchical UNIQUE: (term_type, slug). Allows e.g. "fashion-models" both
-- as a category_group slug and an unrelated parent_category slug.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'taxonomy_terms_term_type_slug_uniq'
      AND conrelid = 'public.taxonomy_terms'::regclass
  ) THEN
    ALTER TABLE public.taxonomy_terms
      ADD CONSTRAINT taxonomy_terms_term_type_slug_uniq UNIQUE (term_type, slug);
  END IF;
END $$;

-- Indexes for hierarchy and search.
CREATE INDEX IF NOT EXISTS idx_taxonomy_terms_parent
  ON public.taxonomy_terms (parent_id)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_taxonomy_terms_term_type_active
  ON public.taxonomy_terms (term_type)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_taxonomy_terms_public_filter
  ON public.taxonomy_terms (term_type, sort_order)
  WHERE archived_at IS NULL AND is_public_filter = TRUE;

CREATE INDEX IF NOT EXISTS idx_taxonomy_terms_search_synonyms
  ON public.taxonomy_terms USING GIN (search_synonyms);

CREATE INDEX IF NOT EXISTS idx_taxonomy_terms_ai_keywords
  ON public.taxonomy_terms USING GIN (ai_keywords);

COMMENT ON COLUMN public.taxonomy_terms.parent_id IS
  'Hierarchy parent. NULL for top-level (parent_category, language, standalone attribute).';
COMMENT ON COLUMN public.taxonomy_terms.term_type IS
  'v2 hierarchical type: parent_category, category_group, talent_type, specialty, skill_group, skill, context_group, context, credential, attribute, language. Coexists with legacy kind for backward compat.';
COMMENT ON COLUMN public.taxonomy_terms.level IS
  'Tree depth (1 = top-level parent_category or root). Set by seed migration; not enforced by trigger.';
COMMENT ON COLUMN public.taxonomy_terms.is_public_filter IS
  'If TRUE, this term is exposed in the public directory facet. Typical use: parent_category rows that should appear in the top-bar.';
COMMENT ON COLUMN public.taxonomy_terms.is_profile_badge IS
  'If TRUE, this term renders as a badge on talent profile cards. Default TRUE; set FALSE to hide raw terms (e.g. legacy language rows once talent_languages is canonical).';
COMMENT ON COLUMN public.taxonomy_terms.is_restricted IS
  'If TRUE, this term is reserved for restricted hubs and must not surface in the core marketplace. Wired in PR 2.';
COMMENT ON COLUMN public.taxonomy_terms.restriction_level IS
  'Advisory: age_18, age_21, identity_verified, manual_review. Used only when is_restricted=TRUE.';
COMMENT ON COLUMN public.taxonomy_terms.search_synonyms IS
  'User-typed synonyms for filter/search matching (e.g. ["fire performer","flame dancer"] for "fire-dancer").';
COMMENT ON COLUMN public.taxonomy_terms.ai_keywords IS
  'AI search hints; included in talent embedding documents to widen semantic match.';

COMMIT;
