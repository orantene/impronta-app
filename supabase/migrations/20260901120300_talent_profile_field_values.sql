-- Talent Profile Field Values — Master Catalog (Phase D, step 4)
--
-- Per-talent values for type-specific catalog fields. Universal +
-- global fields stay as columns on talent_profiles (legalName, pronouns,
-- city, etc.) — they're high-traffic, every profile has them, and a
-- typed column is a better access pattern than JSON KV.
--
-- Type-specific fields (height, bust, vehicle_type, cuisine, music
-- genre) live here. Most talent fill 5–20 of these; a JSON KV table
-- avoids 100 mostly-NULL columns on talent_profiles.
--
-- Schema decisions:
--   - One row per (talent × field). If a talent fills "models.height"
--     it gets a row; not filled = no row.
--   - value JSONB so any kind (text/number/select/multiselect/chips)
--     fits one column. Render layer parses based on
--     profile_field_definitions.kind.
--   - visibility_override per row — talent's per-field privacy choice.
--     NULL inherits the catalog's default_visibility (or workspace
--     default_visibility_override, whichever takes precedence).
--   - Promotion path: when a field becomes high-traffic enough to
--     justify a typed column on talent_profiles, write a backfill
--     migration that copies the JSON values out, then drop those
--     field_values rows. Schema stays clean.
--
-- Example queries:
--   -- All measurements for a talent (model context)
--   SELECT pfd.field_key, tpfv.value, tpfv.visibility_override
--     FROM public.talent_profile_field_values tpfv
--     JOIN public.profile_field_definitions  pfd
--       ON pfd.id = tpfv.field_definition_id
--    WHERE tpfv.talent_profile_id = $1
--      AND pfd.section = 'measurements';
--
--   -- Filter directory by hair color (catalog says searchable)
--   SELECT DISTINCT tpfv.talent_profile_id
--     FROM public.talent_profile_field_values tpfv
--     JOIN public.profile_field_definitions pfd
--       ON pfd.id = tpfv.field_definition_id
--    WHERE pfd.field_key = 'measurements.hairColor'
--      AND tpfv.value ? 'Black';   -- JSON contains check
--
-- DOWN (manual):
--   DROP TRIGGER IF EXISTS trg_tpfv_touch_updated_at
--     ON public.talent_profile_field_values;
--   DROP FUNCTION IF EXISTS public.talent_profile_field_values_touch_updated_at();
--   DROP TABLE IF EXISTS public.talent_profile_field_values;

BEGIN;

CREATE TABLE IF NOT EXISTS public.talent_profile_field_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Tenant denormalized for RLS performance. Always equals
  -- talent_profiles.agency_id (or NULL for freelance / self-rep).
  tenant_id UUID REFERENCES public.agencies(id) ON DELETE CASCADE,

  talent_profile_id UUID NOT NULL
    REFERENCES public.talent_profiles(id) ON DELETE CASCADE,

  field_definition_id UUID NOT NULL
    REFERENCES public.profile_field_definitions(id) ON DELETE CASCADE,

  -- The value. JSONB to fit any catalog kind:
  --   text/number      → primitive (e.g. "175 cm" / 38)
  --   select           → string  (e.g. "Black")
  --   multiselect      → string[] (e.g. ["Editorial","Commercial"])
  --   chips            → string[] (e.g. ["Italian","Spanish"])
  --   date             → ISO string
  --   toggle           → boolean
  --   textarea         → string
  -- Render layer parses based on profile_field_definitions.kind.
  value JSONB NOT NULL,

  -- Per-field visibility override. NULL = inherit catalog default.
  -- Talent-controlled.
  visibility_override TEXT[]
    CHECK (visibility_override IS NULL
        OR visibility_override <@ ARRAY['public','agency','private']::TEXT[]),

  -- Workflow state for fields that require review on change. When
  -- talent self-edits a field with requires_review_on_change=TRUE on
  -- the catalog, the value is marked pending until admin approves.
  -- 'live' = visible everywhere; 'pending' = waiting for review;
  -- 'rejected' = admin asked talent to edit.
  workflow_state TEXT NOT NULL DEFAULT 'live'
    CHECK (workflow_state IN ('live', 'pending', 'rejected')),

  -- Last-edited audit trail.
  last_edited_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  last_edited_role TEXT
    CHECK (last_edited_role IS NULL OR last_edited_role IN ('talent', 'admin', 'platform')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (talent_profile_id, field_definition_id)
);

CREATE INDEX IF NOT EXISTS idx_tpfv_talent_profile
  ON public.talent_profile_field_values (talent_profile_id);

CREATE INDEX IF NOT EXISTS idx_tpfv_field_definition
  ON public.talent_profile_field_values (field_definition_id);

CREATE INDEX IF NOT EXISTS idx_tpfv_tenant
  ON public.talent_profile_field_values (tenant_id)
  WHERE tenant_id IS NOT NULL;

-- For directory search by searchable field values. The render layer
-- joins this with profile_field_definitions WHERE is_searchable.
CREATE INDEX IF NOT EXISTS idx_tpfv_value_gin
  ON public.talent_profile_field_values USING GIN (value);

-- ─── updated_at trigger ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.talent_profile_field_values_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tpfv_touch_updated_at
  ON public.talent_profile_field_values;

CREATE TRIGGER trg_tpfv_touch_updated_at
  BEFORE UPDATE ON public.talent_profile_field_values
  FOR EACH ROW EXECUTE FUNCTION public.talent_profile_field_values_touch_updated_at();

-- ─── Row-level security ────────────────────────────────────────────────────
-- Mirrors talent_service_areas: talent reads/writes own; agency staff
-- read/write all profiles in their tenant; platform staff full access.
-- Public reads are gated by talent_profiles.visibility = 'public' AND
-- workflow_status = 'approved' (joined check).

ALTER TABLE public.talent_profile_field_values ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tpfv_select_public ON public.talent_profile_field_values;
CREATE POLICY tpfv_select_public ON public.talent_profile_field_values
  FOR SELECT
  USING (
    workflow_state = 'live'
    AND EXISTS (
      SELECT 1 FROM public.talent_profiles tp
       WHERE tp.id = talent_profile_field_values.talent_profile_id
         AND tp.workflow_status = 'approved'
         AND tp.visibility = 'public'
    )
    AND EXISTS (
      SELECT 1 FROM public.profile_field_definitions pfd
       WHERE pfd.id = talent_profile_field_values.field_definition_id
         AND (
           'public' = ANY (
             COALESCE(
               talent_profile_field_values.visibility_override,
               pfd.default_visibility
             )
           )
         )
    )
  );

DROP POLICY IF EXISTS tpfv_select_own ON public.talent_profile_field_values;
CREATE POLICY tpfv_select_own ON public.talent_profile_field_values
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.talent_profiles tp
       WHERE tp.id = talent_profile_field_values.talent_profile_id
         AND tp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS tpfv_select_staff ON public.talent_profile_field_values;
CREATE POLICY tpfv_select_staff ON public.talent_profile_field_values
  FOR SELECT
  USING (
    public.is_agency_staff()
    OR (tenant_id IS NOT NULL AND public.is_staff_of_tenant(tenant_id))
  );

DROP POLICY IF EXISTS tpfv_write_own_or_staff ON public.talent_profile_field_values;
CREATE POLICY tpfv_write_own_or_staff ON public.talent_profile_field_values
  FOR ALL
  USING (
    public.is_agency_staff()
    OR (tenant_id IS NOT NULL AND public.is_staff_of_tenant(tenant_id))
    OR EXISTS (
      SELECT 1 FROM public.talent_profiles tp
       WHERE tp.id = talent_profile_field_values.talent_profile_id
         AND tp.user_id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_agency_staff()
    OR (tenant_id IS NOT NULL AND public.is_staff_of_tenant(tenant_id))
    OR EXISTS (
      SELECT 1 FROM public.talent_profiles tp
       WHERE tp.id = talent_profile_field_values.talent_profile_id
         AND tp.user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.talent_profile_field_values IS
  'Per-talent values for type-specific catalog fields. Universal/global fields stay as columns on talent_profiles. JSONB value fits any kind. visibility_override gives talent per-field privacy control.';
COMMENT ON COLUMN public.talent_profile_field_values.workflow_state IS
  'live = visible to consumers. pending = talent self-edited a review-required field; admin must approve. rejected = admin requested edits before approval.';
COMMENT ON COLUMN public.talent_profile_field_values.value IS
  'JSONB. Render layer parses based on profile_field_definitions.kind (text/number/select/multiselect/chips/date/toggle/textarea). Use jsonb_typeof() in queries.';

COMMIT;
