-- Taxonomy v2 — extend public.talent_profile_taxonomy with relationship
-- semantics, tenant scoping, proficiency, ordering, and timestamps.
--
-- Existing PK (talent_profile_id, taxonomy_term_id) and live assignments are
-- preserved. Existing is_primary BOOLEAN stays in place. New columns are
-- additive.
--
-- relationship_type captures *how* a term is attached (primary_role,
-- secondary_role, specialty, skill, context, credential, attribute). It's
-- backfilled from the existing is_primary flag joined to the term's term_type
-- (set in migration 20260801120000).
--
-- tenant_id is added now (nullable, backfilled from
-- talent_profiles.created_by_agency_id with a fallback to the default tenant)
-- so the next phase 2 RLS rebind can flip to is_staff_of_tenant() without a
-- second migration. RLS policies on this table are NOT changed in this
-- migration.
--
-- DOWN (manual):
--   DROP INDEX IF EXISTS public.ux_talent_profile_taxonomy_one_primary;
--   DROP TRIGGER IF EXISTS trg_talent_profile_taxonomy_touch_updated_at
--     ON public.talent_profile_taxonomy;
--   ALTER TABLE public.talent_profile_taxonomy
--     DROP COLUMN IF EXISTS tenant_id,
--     DROP COLUMN IF EXISTS relationship_type,
--     DROP COLUMN IF EXISTS proficiency_level,
--     DROP COLUMN IF EXISTS years_experience,
--     DROP COLUMN IF EXISTS display_order,
--     DROP COLUMN IF EXISTS verified_at,
--     DROP COLUMN IF EXISTS created_at,
--     DROP COLUMN IF EXISTS updated_at;

BEGIN;

ALTER TABLE public.talent_profile_taxonomy
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.agencies(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS relationship_type TEXT,
  ADD COLUMN IF NOT EXISTS proficiency_level TEXT,
  ADD COLUMN IF NOT EXISTS years_experience NUMERIC(4,1),
  ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Backfill relationship_type from term_type + is_primary.
-- Done as a single UPDATE with a CASE so rows without a join still get a
-- safe default ('attribute').
UPDATE public.talent_profile_taxonomy AS tpt
   SET relationship_type = CASE
         WHEN tt.term_type = 'talent_type' AND tpt.is_primary = TRUE  THEN 'primary_role'
         WHEN tt.term_type = 'talent_type' AND tpt.is_primary = FALSE THEN 'secondary_role'
         WHEN tt.term_type = 'specialty'                              THEN 'specialty'
         WHEN tt.term_type = 'skill'                                  THEN 'skill'
         WHEN tt.term_type = 'context'                                THEN 'context'
         WHEN tt.term_type = 'credential'                             THEN 'credential'
         WHEN tt.term_type = 'attribute'                              THEN 'attribute'
         WHEN tt.term_type = 'language'                               THEN 'attribute'
         ELSE 'attribute'
       END
  FROM public.taxonomy_terms AS tt
 WHERE tt.id = tpt.taxonomy_term_id
   AND tpt.relationship_type IS NULL;

-- Any orphan rows (term row missing) get a safe default so NOT NULL holds.
UPDATE public.talent_profile_taxonomy
   SET relationship_type = 'attribute'
 WHERE relationship_type IS NULL;

-- Backfill tenant_id from talent_profiles.created_by_agency_id; fall back to
-- the default tenant so RLS can rebind cleanly later.
UPDATE public.talent_profile_taxonomy AS tpt
   SET tenant_id = COALESCE(
         tp.created_by_agency_id,
         '00000000-0000-0000-0000-000000000001'::UUID
       )
  FROM public.talent_profiles AS tp
 WHERE tp.id = tpt.talent_profile_id
   AND tpt.tenant_id IS NULL;

-- Lock the relationship_type domain. Includes 'specialty' even though it's
-- distinct from 'skill' so we can model "Belly Dancer" attached to a
-- "Latin Dancer" talent_type as a true specialty.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'talent_profile_taxonomy_relationship_type_check'
      AND conrelid = 'public.talent_profile_taxonomy'::regclass
  ) THEN
    ALTER TABLE public.talent_profile_taxonomy
      ADD CONSTRAINT talent_profile_taxonomy_relationship_type_check
      CHECK (relationship_type IN (
        'primary_role',
        'secondary_role',
        'specialty',
        'skill',
        'context',
        'credential',
        'attribute'
      ));
  END IF;
END $$;

ALTER TABLE public.talent_profile_taxonomy
  ALTER COLUMN relationship_type SET NOT NULL,
  ALTER COLUMN relationship_type SET DEFAULT 'attribute';

-- Optional proficiency vocabulary; nullable. Looser CHECK (free-form allowed
-- for credentials/attributes) — only enforces sane levels when populated for
-- skills.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'talent_profile_taxonomy_proficiency_level_check'
      AND conrelid = 'public.talent_profile_taxonomy'::regclass
  ) THEN
    ALTER TABLE public.talent_profile_taxonomy
      ADD CONSTRAINT talent_profile_taxonomy_proficiency_level_check
      CHECK (
        proficiency_level IS NULL
        OR proficiency_level IN ('beginner','intermediate','advanced','expert','master')
      );
  END IF;
END $$;

-- At most one primary_role row per talent profile. Spans all term_types so
-- a profile can't be flagged primary as both "Fashion Model" and
-- "Promotional Model". Secondary roles, specialties, skills, contexts have
-- no per-profile cap.
CREATE UNIQUE INDEX IF NOT EXISTS ux_talent_profile_taxonomy_one_primary
  ON public.talent_profile_taxonomy (talent_profile_id)
  WHERE relationship_type = 'primary_role';

CREATE INDEX IF NOT EXISTS idx_talent_profile_taxonomy_relationship
  ON public.talent_profile_taxonomy (talent_profile_id, relationship_type);

CREATE INDEX IF NOT EXISTS idx_talent_profile_taxonomy_tenant
  ON public.talent_profile_taxonomy (tenant_id)
  WHERE tenant_id IS NOT NULL;

-- Standard updated_at trigger (mirrors agencies / inquiries pattern).
CREATE OR REPLACE FUNCTION public.talent_profile_taxonomy_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_talent_profile_taxonomy_touch_updated_at
  ON public.talent_profile_taxonomy;

CREATE TRIGGER trg_talent_profile_taxonomy_touch_updated_at
  BEFORE UPDATE ON public.talent_profile_taxonomy
  FOR EACH ROW EXECUTE FUNCTION public.talent_profile_taxonomy_touch_updated_at();

-- ─── Validator: relationship_type must match the term's term_type ──────────
-- Prevents a skill term from being attached as a primary_role, a context as
-- a specialty, etc. The legacy 'language' term_type maps to 'attribute' so
-- transitional language assignments don't break.
CREATE OR REPLACE FUNCTION public.validate_talent_profile_taxonomy_relationship()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_term_type TEXT;
  v_allowed   BOOLEAN;
BEGIN
  SELECT term_type INTO v_term_type
    FROM public.taxonomy_terms
   WHERE id = NEW.taxonomy_term_id;

  IF v_term_type IS NULL THEN
    RAISE EXCEPTION 'taxonomy_term % has no term_type set', NEW.taxonomy_term_id;
  END IF;

  v_allowed := CASE NEW.relationship_type
    WHEN 'primary_role'   THEN v_term_type = 'talent_type'
    WHEN 'secondary_role' THEN v_term_type = 'talent_type'
    WHEN 'specialty'      THEN v_term_type IN ('specialty','talent_type')
    WHEN 'skill'          THEN v_term_type = 'skill'
    WHEN 'context'        THEN v_term_type = 'context'
    WHEN 'credential'     THEN v_term_type = 'credential'
    WHEN 'attribute'      THEN v_term_type IN ('attribute','language')
    ELSE FALSE
  END;

  IF NOT v_allowed THEN
    RAISE EXCEPTION
      'relationship_type=% is not allowed for taxonomy_term term_type=% (term_id=%)',
      NEW.relationship_type, v_term_type, NEW.taxonomy_term_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_talent_profile_taxonomy_validate_relationship
  ON public.talent_profile_taxonomy;

CREATE TRIGGER trg_talent_profile_taxonomy_validate_relationship
  BEFORE INSERT OR UPDATE OF taxonomy_term_id, relationship_type
  ON public.talent_profile_taxonomy
  FOR EACH ROW EXECUTE FUNCTION public.validate_talent_profile_taxonomy_relationship();

COMMENT ON COLUMN public.talent_profile_taxonomy.relationship_type IS
  'How the term is attached. primary_role = the role this profile leads with (max 1 per profile). secondary_role = additional bookable roles. specialty/skill/context/credential/attribute = refinement layers.';
COMMENT ON COLUMN public.talent_profile_taxonomy.tenant_id IS
  'Phase 1 backfill: nullable, populated from talent_profiles.created_by_agency_id (fallback to default tenant). Phase 2 will set NOT NULL and rebind RLS to is_staff_of_tenant().';
COMMENT ON COLUMN public.talent_profile_taxonomy.proficiency_level IS
  'Optional skill/specialty proficiency: beginner|intermediate|advanced|expert|master.';
COMMENT ON COLUMN public.talent_profile_taxonomy.years_experience IS
  'Optional self-reported years of experience for this role/skill.';
COMMENT ON COLUMN public.talent_profile_taxonomy.verified_at IS
  'Timestamp when an agency staff or platform admin verified this attachment (e.g. credential proof).';

COMMIT;
