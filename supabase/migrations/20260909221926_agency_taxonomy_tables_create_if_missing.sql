-- Rebuild the two per-tenant taxonomy tables the repo could never create.
--
-- public.agency_taxonomy_settings and public.agency_taxonomy_terms exist in
-- production because someone applied them by hand: no migration in this
-- directory has a CREATE TABLE for either one, only ALTERs, INSERTs and index
-- work that assume they are already there. Any database built from this repo
-- (a fresh local stack, the isolated QA branch, a restored preview) therefore
-- lacks them, and every reader of the tenant taxonomy fails outside production.
--
-- This file is written from production's live definitions (columns, defaults,
-- constraints, indexes, RLS policies, grants) and is a NO-OP there: every
-- statement is guarded, so it creates on an empty database and changes nothing
-- on one that already has the objects.
--
-- Ordering note, stated precisely because an earlier draft of this comment
-- understated it. FOUR older files touch these tables unconditionally and all
-- of them sort BEFORE this one, so a literal replay of the whole directory
-- from zero still stops in the first of them:
--   20260527063534  ALTER TABLE ... ADD COLUMN
--   20260527174407  INSERT INTO ... (unguarded)
--   20260615194714  CREATE INDEX IF NOT EXISTS on a table that does not exist
--                   (the guard covers the index, not the table)
--   20260615211200  ALTER ... ADD COLUMN, UPDATE, then DROP COLUMN
--
-- This file cannot simply be dated earlier to fix that: it references
-- public.agencies (20260601100000) and public.is_staff_of_tenant
-- (20260602100000), both of which are themselves created AFTER the first of
-- the four. So a true from-zero replay needs those four made conditional, or
-- the history squashed. That work is tracked as a defect and is not done here.
--
-- What this file DOES fix, today: any database that already has the shared
-- history applied but lacks these two tables - the isolated QA branch, a
-- restored preview, a rebuilt local stack - gains them in production's exact
-- shape. The shape below is the POST-ALTER shape.

BEGIN;

-- ─── agency_taxonomy_terms ──────────────────────────────────────────────────
-- Tenant-authored terms. parent_term_id points at the GLOBAL taxonomy_terms
-- tree, not at this table: a tenant term hangs off a canonical parent.

CREATE TABLE IF NOT EXISTS public.agency_taxonomy_terms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  term_type TEXT NOT NULL CHECK (
    term_type = ANY (ARRAY['talent_type', 'specialty', 'skill', 'context', 'credential'])
  ),
  parent_term_id UUID REFERENCES public.taxonomy_terms(id) ON DELETE SET NULL,
  slug TEXT NOT NULL,
  name_en TEXT NOT NULL,
  name_es TEXT,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  search_synonyms TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agency_taxonomy_terms_slug_format CHECK (
    slug ~ '^[a-z0-9-]+$' AND char_length(slug) >= 1 AND char_length(slug) <= 64
  ),
  CONSTRAINT agency_taxonomy_terms_name_len CHECK (
    char_length(name_en) >= 1 AND char_length(name_en) <= 80
  ),
  CONSTRAINT agency_taxonomy_terms_unique UNIQUE (tenant_id, term_type, slug)
);

-- Columns, for a database that has a partial copy of the table.
ALTER TABLE public.agency_taxonomy_terms
  ADD COLUMN IF NOT EXISTS tenant_id UUID,
  ADD COLUMN IF NOT EXISTS term_type TEXT,
  ADD COLUMN IF NOT EXISTS parent_term_id UUID,
  ADD COLUMN IF NOT EXISTS slug TEXT,
  ADD COLUMN IF NOT EXISTS name_en TEXT,
  ADD COLUMN IF NOT EXISTS name_es TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS search_synonyms TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_agency_taxonomy_terms_tenant_active
  ON public.agency_taxonomy_terms (tenant_id, term_type)
  WHERE is_active = true;

COMMENT ON TABLE public.agency_taxonomy_terms IS
  'Tenant-authored taxonomy terms. parent_term_id references the canonical public.taxonomy_terms tree.';

-- ─── agency_taxonomy_settings ───────────────────────────────────────────────
-- One row per (tenant, canonical term): the tenant's override of a global term.

CREATE TABLE IF NOT EXISTS public.agency_taxonomy_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  taxonomy_term_id UUID NOT NULL REFERENCES public.taxonomy_terms(id) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  show_in_registration BOOLEAN NOT NULL DEFAULT true,
  show_in_directory BOOLEAN NOT NULL DEFAULT true,
  allow_as_primary BOOLEAN NOT NULL DEFAULT true,
  allow_as_secondary BOOLEAN NOT NULL DEFAULT true,
  requires_approval BOOLEAN NOT NULL DEFAULT false,
  display_order INTEGER NOT NULL DEFAULT 0,
  helper_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  custom_label_i18n JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT agency_taxonomy_settings_helper_text_len CHECK (
    helper_text IS NULL OR char_length(helper_text) <= 280
  ),
  CONSTRAINT agency_taxonomy_settings_unique UNIQUE (tenant_id, taxonomy_term_id)
);

ALTER TABLE public.agency_taxonomy_settings
  ADD COLUMN IF NOT EXISTS tenant_id UUID,
  ADD COLUMN IF NOT EXISTS taxonomy_term_id UUID,
  ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_in_registration BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_in_directory BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_as_primary BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_as_secondary BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS helper_text TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID,
  ADD COLUMN IF NOT EXISTS custom_label_i18n JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_agency_taxonomy_settings_tenant
  ON public.agency_taxonomy_settings (tenant_id)
  WHERE is_enabled = true;

CREATE INDEX IF NOT EXISTS idx_agency_taxonomy_settings_term
  ON public.agency_taxonomy_settings (taxonomy_term_id);

CREATE INDEX IF NOT EXISTS idx_agency_taxonomy_settings_created_by
  ON public.agency_taxonomy_settings (created_by_user_id);

COMMENT ON TABLE public.agency_taxonomy_settings IS
  'Per-tenant override of a canonical taxonomy term: visibility, ordering, approval, localized label.';
COMMENT ON COLUMN public.agency_taxonomy_settings.custom_label_i18n IS
  'Per-locale label override, e.g. {"en":"Barbers","es":"Barberos"}. Replaced custom_label / custom_label_es.';

-- updated_at trigger, exactly as production has it (settings only; the terms
-- table carries an updated_at column but no trigger in production).
CREATE OR REPLACE FUNCTION public._agency_taxonomy_settings_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_agency_taxonomy_settings_updated_at
  ON public.agency_taxonomy_settings;
CREATE TRIGGER trg_agency_taxonomy_settings_updated_at
  BEFORE UPDATE ON public.agency_taxonomy_settings
  FOR EACH ROW EXECUTE FUNCTION public._agency_taxonomy_settings_set_updated_at();

-- ─── RLS ────────────────────────────────────────────────────────────────────
-- Staff of the owning tenant, and nobody else. anon holds SELECT at the grant
-- level but has no policy, so RLS closes it.

ALTER TABLE public.agency_taxonomy_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_taxonomy_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agency_taxonomy_terms_staff_read ON public.agency_taxonomy_terms;
CREATE POLICY agency_taxonomy_terms_staff_read
  ON public.agency_taxonomy_terms
  FOR SELECT TO authenticated
  USING (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS agency_taxonomy_terms_staff_write ON public.agency_taxonomy_terms;
CREATE POLICY agency_taxonomy_terms_staff_write
  ON public.agency_taxonomy_terms
  FOR ALL TO authenticated
  USING (public.is_staff_of_tenant(tenant_id))
  WITH CHECK (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS agency_taxonomy_settings_staff_read ON public.agency_taxonomy_settings;
CREATE POLICY agency_taxonomy_settings_staff_read
  ON public.agency_taxonomy_settings
  FOR SELECT TO authenticated
  USING (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS agency_taxonomy_settings_staff_write ON public.agency_taxonomy_settings;
CREATE POLICY agency_taxonomy_settings_staff_write
  ON public.agency_taxonomy_settings
  FOR ALL TO authenticated
  USING (public.is_staff_of_tenant(tenant_id))
  WITH CHECK (public.is_staff_of_tenant(tenant_id));

-- ─── Grants ─────────────────────────────────────────────────────────────────
-- Mirrors production exactly. anon keeps SELECT (plus the REFERENCES/TRIGGER
-- bits Supabase's default privileges hand every role) and holds NO write
-- privilege; the write path is authenticated staff under RLS.

REVOKE ALL ON TABLE public.agency_taxonomy_terms FROM anon;
REVOKE ALL ON TABLE public.agency_taxonomy_settings FROM anon;

GRANT SELECT, REFERENCES, TRIGGER ON TABLE public.agency_taxonomy_terms TO anon;
GRANT SELECT, REFERENCES, TRIGGER ON TABLE public.agency_taxonomy_settings TO anon;

GRANT ALL ON TABLE public.agency_taxonomy_terms TO authenticated, service_role, postgres;
GRANT ALL ON TABLE public.agency_taxonomy_settings TO authenticated, service_role, postgres;

COMMIT;
