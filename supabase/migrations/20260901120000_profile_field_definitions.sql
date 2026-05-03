-- Profile Field Definitions — Master Profile Field Catalog (Phase D, step 1)
--
-- Rationale
-- ─────────
-- Today the prototype keeps the field catalog in code:
--   web/src/app/prototypes/admin-shell/_field-catalog.ts (FIELD_CATALOG)
--   web/src/app/prototypes/admin-shell/_state.tsx       (TAXONOMY_FIELDS)
--
-- That works for a single-app prototype but doesn't survive contact with
-- production. Agencies need to (eventually) toggle which fields apply to
-- their roster, mark fields required, override labels, and reorder
-- sections — all without a code deploy. The catalog has to live in the
-- database.
--
-- This migration introduces the canonical schema. Subsequent migrations
-- in this set (20260901120100..120300) add the recommendation join table,
-- workspace overrides, and per-talent values. A seed migration
-- (20260901120400) populates all rows from the current FIELD_CATALOG
-- + TAXONOMY_FIELDS export.
--
-- Source-of-truth model
-- ─────────────────────
-- profile_field_definitions     ← what fields exist (Tulala-curated)
-- profile_field_recommendations ← which fields apply / are required for
--                                 which talent types
-- workspace_profile_field_settings ← per-tenant overrides on top of
--                                    catalog defaults
-- talent_profile_field_values   ← per-talent values keyed by field_id
--
-- Universal + global fields stay as columns on talent_profiles (legalName,
-- pronouns, etc.) — no need to denormalize. Only type-specific fields
-- (height, bust, vehicle_type, cuisine, etc.) live in field_values.
-- Migration target: progressive promotion of high-traffic field_values
-- entries into typed columns when their access pattern justifies it.
--
-- Tier model (matches the frontend FIELD_CATALOG.tier):
--   universal     — every talent has it; required to publish.
--   global        — cross-type, optional. Most talent eventually fill it.
--   type-specific — only relevant for one or a few talent types (driven
--                   by profile_field_recommendations).
--
-- DOWN (manual):
--   DROP TRIGGER IF EXISTS trg_profile_field_definitions_touch_updated_at
--     ON public.profile_field_definitions;
--   DROP FUNCTION IF EXISTS public.profile_field_definitions_touch_updated_at();
--   DROP TABLE IF EXISTS public.profile_field_definitions;

BEGIN;

CREATE TABLE IF NOT EXISTS public.profile_field_definitions (
  -- Stable string id matching FIELD_CATALOG.id ("identity.legalName",
  -- "measurements.bust", "models.height"). Acts as the natural key the
  -- frontend already uses. UUID surrogate kept for FK convenience.
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_key TEXT NOT NULL UNIQUE,

  label TEXT NOT NULL,

  tier TEXT NOT NULL
    CHECK (tier IN ('universal', 'global', 'type-specific')),

  -- UI section the field renders in. Drives drawer accordion grouping.
  section TEXT NOT NULL
    CHECK (section IN (
      'identity', 'location', 'languages', 'media',
      'measurements', 'wardrobe', 'rates', 'travel', 'skills',
      'limits', 'credits', 'reviews', 'social', 'documents',
      'emergency', 'type-specific'
    )),

  -- Drawer subsection for type-specific fields. Today: 'physical' or
  -- 'wardrobe' inside the measurements/wardrobe accordions. NULL for
  -- catch-all type-specific.
  subsection TEXT
    CHECK (subsection IS NULL OR subsection IN ('physical', 'wardrobe')),

  -- Rendering metadata (formerly RegField on TAXONOMY_FIELDS).
  kind TEXT NOT NULL DEFAULT 'text'
    CHECK (kind IN ('text', 'number', 'select', 'multiselect', 'chips', 'date', 'toggle', 'textarea')),
  placeholder TEXT,
  helper TEXT,
  -- For select / multiselect kinds. JSONB array of strings; NULL for
  -- non-enum kinds. Example: ["Black","Brown","Blonde","Red","Grey","Other"].
  options JSONB
    CHECK (options IS NULL OR jsonb_typeof(options) = 'array'),

  -- Default optional state for non-type-specific fields. Type-specific
  -- required-ness lives in profile_field_recommendations.required_for.
  is_optional BOOLEAN NOT NULL DEFAULT TRUE,

  -- Privacy + visibility defaults. Talent override per-field via
  -- talent_profile_field_values.visibility_override.
  is_sensitive BOOLEAN NOT NULL DEFAULT FALSE,
  default_visibility TEXT[] NOT NULL DEFAULT ARRAY['agency']::TEXT[]
    CHECK (default_visibility <@ ARRAY['public','agency','private']::TEXT[]),

  -- Mode flags — which surfaces include this field by default.
  -- workspace_profile_field_settings can override these per-tenant.
  show_in_registration BOOLEAN NOT NULL DEFAULT TRUE,
  show_in_edit_drawer  BOOLEAN NOT NULL DEFAULT TRUE,
  show_in_public       BOOLEAN NOT NULL DEFAULT FALSE,
  show_in_directory    BOOLEAN NOT NULL DEFAULT FALSE,

  -- Permission flags.
  admin_only       BOOLEAN NOT NULL DEFAULT FALSE,
  talent_editable  BOOLEAN NOT NULL DEFAULT TRUE,
  -- When true, talent self-edit moves the profile to pending-review
  -- instead of publishing immediately. Catalog default; workspace can
  -- override for stricter or looser flows.
  requires_review_on_change BOOLEAN NOT NULL DEFAULT FALSE,

  -- Search + completeness behavior.
  is_searchable BOOLEAN NOT NULL DEFAULT FALSE,
  -- For count-based completeness math (e.g. portfolio needs >=3 items,
  -- languages needs >=1). NULL means "any non-empty value counts".
  count_min INTEGER CHECK (count_min IS NULL OR count_min >= 1),

  -- Display order within a section. Lower = earlier. Workspace can
  -- override per-tenant via workspace_profile_field_settings.display_order.
  display_order INTEGER NOT NULL DEFAULT 100,

  -- Free-form note for designers / engineers reading the catalog.
  note TEXT,

  -- Tulala can mark a field deprecated without dropping the row — keeps
  -- existing field values intact while hiding the field from new flows.
  deprecated_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profile_field_definitions_tier
  ON public.profile_field_definitions (tier)
  WHERE deprecated_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_profile_field_definitions_section
  ON public.profile_field_definitions (section, display_order)
  WHERE deprecated_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_profile_field_definitions_searchable
  ON public.profile_field_definitions (field_key)
  WHERE is_searchable = TRUE AND deprecated_at IS NULL;

-- ─── updated_at trigger ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.profile_field_definitions_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profile_field_definitions_touch_updated_at
  ON public.profile_field_definitions;

CREATE TRIGGER trg_profile_field_definitions_touch_updated_at
  BEFORE UPDATE ON public.profile_field_definitions
  FOR EACH ROW EXECUTE FUNCTION public.profile_field_definitions_touch_updated_at();

-- ─── Row-level security ────────────────────────────────────────────────────
-- The catalog itself is platform-curated; everyone can READ. Only
-- `is_agency_staff()` (Tulala internal staff) can WRITE. Per-tenant
-- overrides live in workspace_profile_field_settings instead.

ALTER TABLE public.profile_field_definitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profile_field_definitions_read ON public.profile_field_definitions;
CREATE POLICY profile_field_definitions_read ON public.profile_field_definitions
  FOR SELECT
  USING (TRUE);

DROP POLICY IF EXISTS profile_field_definitions_write_platform_only ON public.profile_field_definitions;
CREATE POLICY profile_field_definitions_write_platform_only ON public.profile_field_definitions
  FOR ALL
  USING (public.is_agency_staff())
  WITH CHECK (public.is_agency_staff());

COMMENT ON TABLE public.profile_field_definitions IS
  'Master Profile Field Catalog — every profile field on the platform, tiered (universal/global/type-specific), with rendering metadata + privacy + mode flags. Agencies override per-tenant via workspace_profile_field_settings; agencies cannot add new fields.';
COMMENT ON COLUMN public.profile_field_definitions.field_key IS
  'Stable string id used by the frontend (FIELD_CATALOG.id) and by talent_profile_field_values.field_id. Examples: "identity.legalName", "measurements.bust", "models.experience_yrs".';
COMMENT ON COLUMN public.profile_field_definitions.tier IS
  'universal = every talent has it (publish gate); global = cross-type optional; type-specific = only relevant per talent type (see profile_field_recommendations).';
COMMENT ON COLUMN public.profile_field_definitions.default_visibility IS
  'Array subset of {public,agency,private}. Talent override per-field via talent_profile_field_values.visibility_override.';
COMMENT ON COLUMN public.profile_field_definitions.requires_review_on_change IS
  'When true, talent self-edits move the profile to pending-review instead of publishing immediately.';

COMMIT;
