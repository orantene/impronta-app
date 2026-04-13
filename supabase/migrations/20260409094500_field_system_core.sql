-- Field system: dynamic field definitions above taxonomy.
-- Designed for admin-managed profile schema, filter/search visibility, and future AI search wiring.

BEGIN;
-- Dependency guard: this migration relies on core init objects.
DO $$
BEGIN
  IF to_regprocedure('gen_random_uuid()') IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42883',
      MESSAGE = 'Missing dependency: gen_random_uuid()',
      DETAIL = 'This migration uses gen_random_uuid() defaults (pgcrypto extension).',
      HINT = 'Apply the init migration that enables pgcrypto (e.g. 20250409000000_init.sql) before this migration.';
  END IF;

  IF to_regtype('public.taxonomy_kind') IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42704',
      MESSAGE = 'Missing dependency: public.taxonomy_kind',
      DETAIL = 'field_definitions.taxonomy_kind references the public.taxonomy_kind enum.',
      HINT = 'Apply the init migration that creates public.taxonomy_kind (e.g. 20250409000000_init.sql) before this migration.';
  END IF;

  IF to_regprocedure('public.is_agency_staff()') IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42883',
      MESSAGE = 'Missing dependency: public.is_agency_staff()',
      DETAIL = 'RLS policies in this migration call public.is_agency_staff().',
      HINT = 'Apply the init migration that defines public.is_agency_staff() (e.g. 20250409000000_init.sql) before this migration.';
  END IF;
END
$$;
DO $$
BEGIN
  CREATE TYPE public.field_required_level AS ENUM ('optional', 'recommended', 'required');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;
DO $$
BEGIN
  CREATE TYPE public.field_value_type AS ENUM (
    'text',
    'textarea',
    'number',
    'date',
    'boolean',
    'taxonomy_single',
    'taxonomy_multi',
    'location'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;
CREATE TABLE IF NOT EXISTS public.field_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name_en TEXT NOT NULL,
  name_es TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.field_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_group_id UUID REFERENCES public.field_groups (id) ON DELETE SET NULL,
  key TEXT NOT NULL UNIQUE,
  label_en TEXT NOT NULL,
  label_es TEXT,
  help_en TEXT,
  help_es TEXT,
  value_type public.field_value_type NOT NULL,
  required_level public.field_required_level NOT NULL DEFAULT 'optional',
  public_visible BOOLEAN NOT NULL DEFAULT TRUE,
  internal_only BOOLEAN NOT NULL DEFAULT FALSE,
  card_visible BOOLEAN NOT NULL DEFAULT FALSE,
  profile_visible BOOLEAN NOT NULL DEFAULT TRUE,
  filterable BOOLEAN NOT NULL DEFAULT FALSE,
  searchable BOOLEAN NOT NULL DEFAULT FALSE,
  ai_visible BOOLEAN NOT NULL DEFAULT TRUE,
  editable_by_talent BOOLEAN NOT NULL DEFAULT FALSE,
  editable_by_staff BOOLEAN NOT NULL DEFAULT TRUE,
  editable_by_admin BOOLEAN NOT NULL DEFAULT TRUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  -- Controlled options:
  taxonomy_kind public.taxonomy_kind,
  -- For future controlled lists:
  config JSONB NOT NULL DEFAULT '{}',
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (NOT (public_visible = FALSE AND internal_only = FALSE)),
  CHECK (
    (value_type IN ('taxonomy_single','taxonomy_multi') AND taxonomy_kind IS NOT NULL)
    OR (value_type NOT IN ('taxonomy_single','taxonomy_multi'))
  )
);
ALTER TABLE public.field_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_definitions ENABLE ROW LEVEL SECURITY;
-- Staff-only for now (fields control system behavior)
DROP POLICY IF EXISTS field_groups_staff ON public.field_groups;
CREATE POLICY field_groups_staff ON public.field_groups
  FOR ALL USING (public.is_agency_staff()) WITH CHECK (public.is_agency_staff());
DROP POLICY IF EXISTS field_definitions_staff ON public.field_definitions;
CREATE POLICY field_definitions_staff ON public.field_definitions
  FOR ALL USING (public.is_agency_staff()) WITH CHECK (public.is_agency_staff());
-- Seed groups
INSERT INTO public.field_groups (slug, name_en, name_es, sort_order) VALUES
  ('classification', 'Classification', 'Clasificación', 10),
  ('traits', 'Traits', 'Rasgos', 20),
  ('abilities', 'Abilities', 'Habilidades', 30),
  ('experience', 'Experience', 'Experiencia', 40),
  ('suitability', 'Suitability', 'Adecuación', 50),
  ('languages', 'Languages', 'Idiomas', 60),
  ('location', 'Location', 'Ubicación', 70)
ON CONFLICT (slug) DO NOTHING;
-- Seed field definitions connected to taxonomy + locations
WITH g AS (
  SELECT id, slug FROM public.field_groups WHERE archived_at IS NULL
)
INSERT INTO public.field_definitions (
  field_group_id,
  key,
  label_en,
  label_es,
  value_type,
  required_level,
  public_visible,
  internal_only,
  card_visible,
  profile_visible,
  filterable,
  searchable,
  ai_visible,
  editable_by_talent,
  editable_by_staff,
  editable_by_admin,
  active,
  sort_order,
  taxonomy_kind,
  help_en,
  help_es
) VALUES
  ((SELECT id FROM g WHERE slug='classification'), 'talent_type', 'Talent Type', 'Tipo de talento', 'taxonomy_single', 'required', TRUE, FALSE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 10, 'talent_type', 'Primary classification used for directory listings.', 'Clasificación primaria para el directorio.'),
  ((SELECT id FROM g WHERE slug='traits'), 'tags', 'Tags', 'Etiquetas', 'taxonomy_multi', 'recommended', TRUE, FALSE, FALSE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 20, 'tag', 'Secondary traits used for filtering and matching.', 'Rasgos secundarios para filtros y match.'),
  ((SELECT id FROM g WHERE slug='abilities'), 'skills', 'Skills', 'Habilidades', 'taxonomy_multi', 'recommended', TRUE, FALSE, FALSE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 30, 'skill', 'Abilities used for filtering.', 'Habilidades para filtros.'),
  ((SELECT id FROM g WHERE slug='experience'), 'industries', 'Industries', 'Industrias', 'taxonomy_multi', 'optional', TRUE, FALSE, FALSE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 40, 'industry', 'Industry experience signals.', 'Experiencia por industria.'),
  ((SELECT id FROM g WHERE slug='suitability'), 'event_types', 'Event Types', 'Tipos de evento', 'taxonomy_multi', 'optional', TRUE, FALSE, FALSE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 50, 'event_type', 'Suitability by event type.', 'Adecuación por tipo de evento.'),
  ((SELECT id FROM g WHERE slug='suitability'), 'fit_labels', 'Fit Labels', 'Etiquetas de ajuste', 'taxonomy_multi', 'optional', TRUE, FALSE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 60, 'fit_label', 'Card badges and quick match cues.', 'Badges en la tarjeta y señales de match.'),
  ((SELECT id FROM g WHERE slug='languages'), 'languages', 'Languages', 'Idiomas', 'taxonomy_multi', 'recommended', TRUE, FALSE, FALSE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 70, 'language', 'Languages used for filtering.', 'Idiomas para filtros.'),
  ((SELECT id FROM g WHERE slug='location'), 'location', 'Location', 'Ubicación', 'location', 'recommended', TRUE, FALSE, TRUE, TRUE, TRUE, TRUE, TRUE, FALSE, TRUE, TRUE, TRUE, 80, NULL, 'Canonical profile location stored in talent_profiles.location_id.', 'Ubicación canónica guardada en talent_profiles.location_id.')
ON CONFLICT (key) DO NOTHING;
COMMIT;
