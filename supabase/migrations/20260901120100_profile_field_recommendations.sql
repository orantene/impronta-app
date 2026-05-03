-- Profile Field Recommendations — Master Catalog (Phase D, step 2)
--
-- Mapping table between profile_field_definitions and taxonomy_terms
-- (talent type parents). Encodes "this field applies to this type",
-- "this field is required for this type", and "this field is
-- recommended (but optional) for this type" — matching the frontend
-- catalog's `appliesTo`, `requiredFor`, and `recommendedFor`.
--
-- Why a join table instead of three TEXT[] columns on field_definitions?
--   - Type-safe FK to taxonomy_terms (talent type catalog must agree)
--   - Easy "all fields recommended for chefs" query without unnesting
--   - Clean audit trail via inserts/deletes
--   - Workspace overrides stay simple (one row in a separate table per
--     field × workspace combination, not per field × type × workspace)
--
-- Universal + global fields don't need rows here — applicability is
-- universal by tier. Type-specific fields without any recommendation
-- rows are inactive (won't show anywhere).
--
-- DOWN (manual):
--   DROP TABLE IF EXISTS public.profile_field_recommendations;

BEGIN;

CREATE TABLE IF NOT EXISTS public.profile_field_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  field_definition_id UUID NOT NULL
    REFERENCES public.profile_field_definitions(id) ON DELETE CASCADE,

  -- Talent type (parent taxonomy term, level 1). The frontend catalog's
  -- TaxonomyParentId values map to taxonomy_terms.slug where
  -- term_type = 'talent_type' AND level = 1.
  taxonomy_term_id UUID NOT NULL
    REFERENCES public.taxonomy_terms(id) ON DELETE CASCADE,

  -- relationship encodes one of three semantics:
  --   applies      = field is shown for this type (default optional)
  --   required     = applies + required to publish for this type
  --   recommended  = applies + ranked first among optionals (UI hint)
  -- A field can be `required` for one type and only `applies` to another;
  -- store one row per (field × type × relationship). Normally a single
  -- row per (field × type) but the schema allows promotion ladder later.
  relationship TEXT NOT NULL
    CHECK (relationship IN ('applies', 'required', 'recommended')),

  display_order INTEGER NOT NULL DEFAULT 100,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (field_definition_id, taxonomy_term_id, relationship)
);

CREATE INDEX IF NOT EXISTS idx_profile_field_recommendations_field
  ON public.profile_field_recommendations (field_definition_id);

CREATE INDEX IF NOT EXISTS idx_profile_field_recommendations_term
  ON public.profile_field_recommendations (taxonomy_term_id);

CREATE INDEX IF NOT EXISTS idx_profile_field_recommendations_required
  ON public.profile_field_recommendations (taxonomy_term_id)
  WHERE relationship = 'required';

ALTER TABLE public.profile_field_recommendations ENABLE ROW LEVEL SECURITY;

-- Catalog mappings are platform-curated. Read public; write internal.
DROP POLICY IF EXISTS profile_field_recommendations_read ON public.profile_field_recommendations;
CREATE POLICY profile_field_recommendations_read ON public.profile_field_recommendations
  FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS profile_field_recommendations_write_platform_only ON public.profile_field_recommendations;
CREATE POLICY profile_field_recommendations_write_platform_only ON public.profile_field_recommendations
  FOR ALL
  USING (public.is_agency_staff())
  WITH CHECK (public.is_agency_staff());

COMMENT ON TABLE public.profile_field_recommendations IS
  'Field × talent-type relationships. relationship=applies means the field is shown for this type; required gates publish; recommended ranks the field first among optionals. Tulala-curated; agencies cannot add rows but can override via workspace_profile_field_settings.required_override.';
COMMENT ON COLUMN public.profile_field_recommendations.relationship IS
  'applies = render for this type; required = applies + must be filled to publish; recommended = applies + ranked above other optionals in the UI.';

COMMIT;
