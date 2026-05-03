-- Workspace Profile Field Settings — Master Catalog (Phase D, step 3)
--
-- Per-tenant overrides on top of the platform field catalog. Lets each
-- agency:
--   - disable a field they don't care about ("we don't track tattoos")
--   - mark an optional field required ("our roster always reports
--     allergies for catering coordination")
--   - flip a field from agency-visibility to public ("our hosts publish
--     their reply-time")
--   - rename ("we say 'lookbook code' instead of 'portfolio reference'")
--   - hide from registration but allow on edit (admin fills it after
--     intake interview)
--   - reorder sections to match the agency's intake script
--
-- Settings rows are sparse — only fields the workspace overrode get a
-- row. Lookups merge: catalog defaults + matching workspace row.
--
-- Tenant-aware RLS: workspace staff can read + write their own rows;
-- platform staff can read all (for support / debugging).
--
-- DOWN (manual):
--   DROP TRIGGER IF EXISTS trg_wpfs_touch_updated_at
--     ON public.workspace_profile_field_settings;
--   DROP FUNCTION IF EXISTS public.workspace_profile_field_settings_touch_updated_at();
--   DROP TABLE IF EXISTS public.workspace_profile_field_settings;

BEGIN;

CREATE TABLE IF NOT EXISTS public.workspace_profile_field_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  tenant_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,

  field_definition_id UUID NOT NULL
    REFERENCES public.profile_field_definitions(id) ON DELETE CASCADE,

  -- Override flags. NULL means "use catalog default". TRUE/FALSE means
  -- "force this state for this workspace's roster".
  enabled_override                 BOOLEAN,
  required_override                BOOLEAN,
  show_in_registration_override    BOOLEAN,
  show_in_edit_drawer_override     BOOLEAN,
  show_in_public_override          BOOLEAN,
  show_in_directory_override       BOOLEAN,
  admin_only_override              BOOLEAN,
  talent_editable_override         BOOLEAN,
  requires_review_on_change_override BOOLEAN,

  -- Per-tenant copy overrides.
  custom_label  TEXT,
  custom_helper TEXT,

  -- Per-tenant display order (for ranking within a section). NULL =
  -- inherit catalog display_order.
  display_order_override INTEGER,

  -- Visibility default override. NULL = inherit catalog default.
  default_visibility_override TEXT[]
    CHECK (default_visibility_override IS NULL
        OR default_visibility_override <@ ARRAY['public','agency','private']::TEXT[]),

  -- When the workspace toggled this override (audit trail).
  last_changed_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, field_definition_id)
);

CREATE INDEX IF NOT EXISTS idx_wpfs_tenant
  ON public.workspace_profile_field_settings (tenant_id);

CREATE INDEX IF NOT EXISTS idx_wpfs_field
  ON public.workspace_profile_field_settings (field_definition_id);

-- ─── updated_at trigger ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.workspace_profile_field_settings_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wpfs_touch_updated_at
  ON public.workspace_profile_field_settings;

CREATE TRIGGER trg_wpfs_touch_updated_at
  BEFORE UPDATE ON public.workspace_profile_field_settings
  FOR EACH ROW EXECUTE FUNCTION public.workspace_profile_field_settings_touch_updated_at();

-- ─── Row-level security ────────────────────────────────────────────────────

ALTER TABLE public.workspace_profile_field_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wpfs_select_tenant_or_platform ON public.workspace_profile_field_settings;
CREATE POLICY wpfs_select_tenant_or_platform ON public.workspace_profile_field_settings
  FOR SELECT
  USING (
    public.is_agency_staff()
    OR public.is_staff_of_tenant(tenant_id)
  );

DROP POLICY IF EXISTS wpfs_write_tenant_or_platform ON public.workspace_profile_field_settings;
CREATE POLICY wpfs_write_tenant_or_platform ON public.workspace_profile_field_settings
  FOR ALL
  USING (
    public.is_agency_staff()
    OR public.is_staff_of_tenant(tenant_id)
  )
  WITH CHECK (
    public.is_agency_staff()
    OR public.is_staff_of_tenant(tenant_id)
  );

COMMENT ON TABLE public.workspace_profile_field_settings IS
  'Per-tenant overrides on top of profile_field_definitions. Sparse — only fields the workspace customized get a row. The render layer merges catalog defaults with matching workspace row at query time.';
COMMENT ON COLUMN public.workspace_profile_field_settings.enabled_override IS
  'When FALSE, this field is hidden from every surface for this workspace. Universal-tier fields ignore enabled_override (they cannot be disabled).';
COMMENT ON COLUMN public.workspace_profile_field_settings.required_override IS
  'When TRUE, this field is required to publish even if the catalog marks it optional. When FALSE, optional even if the catalog marks it required (use sparingly — universal fields cannot be made optional).';

COMMIT;
