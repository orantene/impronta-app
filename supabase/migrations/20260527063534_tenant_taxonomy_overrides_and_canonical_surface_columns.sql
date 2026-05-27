-- ============================================================================
-- 20260527063534_tenant_taxonomy_overrides_and_canonical_surface_columns.sql
--
-- Phase 2 of resolver public-surface-delta plan (web/docs/resolver-public-
-- surface-delta-2026-05-26.md). Three things, atomic:
--
--   Sub-Task 0:    Add canonical sub-surface columns to
--                  profile_field_definitions (and matching override columns to
--                  workspace_profile_field_settings) so the AND-ing in
--                  web/src/lib/field-engine/public-surface-visibility.ts
--                  can collapse onto canonical-only in Sub-Task 5.
--                  Backfill the new columns from legacy field_definitions
--                  surface flags using the OLD_TO_NEW_KEY bridge.
--   Sub-Task 0.5:  Add canonical placeholder rows for the 5 non-bridged
--                  taxonomy section keys that lack one (skills + languages
--                  already exist): fit_labels, industries, event_types, tags,
--                  identity.gender.
--   Sub-Task 1:    Extend agency_taxonomy_settings with custom_label_es and
--                  created_by_user_id so the existing tenant taxonomy
--                  override table covers the spec in the Phase 2 task brief.
--                  Decision: extend the existing table (already used by
--                  LiveTalentTypesDrawer, setTaxonomyFlags, the directory
--                  safety filter, talent-taxonomy-service, and Impronta's
--                  launch curation migration) rather than ship a parallel
--                  workspace_taxonomy_overrides table.
--                  See report "Scope expansions" in the Phase 2 report.
--
-- Non-destructive: no DROP, no DELETE. All new columns are NULLABLE or have
-- a safe default. Existing rows + existing readers keep working unchanged.
-- ============================================================================

BEGIN;

-- ─── Sub-Task 0: canonical sub-surface columns ──────────────────────────────
--
-- profile_field_definitions today carries show_in_public (sidebar gate) and
-- show_in_directory (any directory surface). Phase 2 splits the latter into
-- the three sub-surfaces the helpers actually care about, and gives the
-- sidebar its own canonical flag (so legacy profile_visible can retire).
--
-- Defaults are false because the safe-default for an unknown new field is
-- "private". The backfill below copies the legacy flags onto every row we
-- know about (via OLD_TO_NEW_KEY in web/src/lib/fields/legacy-mirror.ts plus
-- the seven taxonomy section keys, two pre-existing + five added below).

ALTER TABLE public.profile_field_definitions
  ADD COLUMN IF NOT EXISTS show_in_directory_filter boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_in_directory_card boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_in_public_profile_sidebar boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profile_field_definitions.show_in_directory_filter IS
  'Phase 2: public viewer can use this field as a directory filter chip. Backfilled from legacy field_definitions.directory_filter_visible via OLD_TO_NEW_KEY (web/src/lib/fields/legacy-mirror.ts) + the 7 taxonomy section keys.';

COMMENT ON COLUMN public.profile_field_definitions.show_in_directory_card IS
  'Phase 2: public viewer sees this field as a directory card trait line. Backfilled from legacy field_definitions.card_visible.';

COMMENT ON COLUMN public.profile_field_definitions.show_in_public_profile_sidebar IS
  'Phase 2: public viewer sees this field as a sidebar section on /t/[profileCode]. Backfilled from legacy field_definitions.profile_visible.';

-- Tenant overrides for the three new sub-surfaces. Override columns mirror
-- the existing show_in_public_override / show_in_directory_override pattern:
-- nullable → "no override, inherit canonical".

ALTER TABLE public.workspace_profile_field_settings
  ADD COLUMN IF NOT EXISTS show_in_directory_filter_override boolean,
  ADD COLUMN IF NOT EXISTS show_in_directory_card_override boolean,
  ADD COLUMN IF NOT EXISTS show_in_public_profile_sidebar_override boolean;

COMMENT ON COLUMN public.workspace_profile_field_settings.show_in_directory_filter_override IS
  'Phase 2 tenant override for profile_field_definitions.show_in_directory_filter. NULL = inherit canonical.';

COMMENT ON COLUMN public.workspace_profile_field_settings.show_in_directory_card_override IS
  'Phase 2 tenant override for profile_field_definitions.show_in_directory_card. NULL = inherit canonical.';

COMMENT ON COLUMN public.workspace_profile_field_settings.show_in_public_profile_sidebar_override IS
  'Phase 2 tenant override for profile_field_definitions.show_in_public_profile_sidebar. NULL = inherit canonical.';

-- ─── Sub-Task 0.5: canonical placeholder rows for non-bridged section keys ──
--
-- Five canonical rows so the resolver can decide visibility for the
-- taxonomy-derived section keys (fit_labels, industries, event_types, tags)
-- and gender (column-backed on talent_profiles) without falling through to
-- the _syntheticLegacyVisibility branch removed in Sub-Task 5. The two
-- pre-existing rows (`skills`, `languages`) keep their existing UUID + key.
--
-- Naming convention: match existing canonical pattern (`skills`, `languages`
-- are unprefixed). gender goes under the `identity.*` namespace to keep
-- the identity section together — the resolver will treat both `gender` and
-- `identity.gender` as a bridged pair via OLD_TO_NEW_KEY.

INSERT INTO public.profile_field_definitions (
  field_key, label, label_es, tier, section, kind,
  show_in_public, show_in_directory,
  show_in_directory_filter, show_in_directory_card, show_in_public_profile_sidebar,
  admin_only, is_sensitive, talent_editable,
  default_visibility, display_order, helper
)
-- Section values are constrained to the existing enum-like CHECK on
-- profile_field_definitions.section (see Phase 1 migration). The five
-- placeholder rows below pick the closest semantic section that already
-- exists; widening the section CHECK is out of scope for this lane.
VALUES
  ('fit_labels',       'Fit Labels',    'Etiquetas de fit',   'universal', 'skills',     'multiselect',
   true, true, true,  true,  true,  false, false, true,
   ARRAY['public','agency']::text[], 350, 'Quick descriptors that surface on the directory card.'),
  ('industries',       'Industries',    'Industrias',         'universal', 'credits',    'multiselect',
   true, true, true,  true,  true,  false, false, true,
   ARRAY['public','agency']::text[], 360, 'Industries this talent has worked in.'),
  ('event_types',      'Event Types',   'Tipos de evento',    'universal', 'credits',    'multiselect',
   true, true, true,  false, true,  false, false, true,
   ARRAY['public','agency']::text[], 365, 'Event formats this talent supports.'),
  ('tags',             'Tags',          'Etiquetas',          'universal', 'skills',     'multiselect',
   true, true, true,  false, true,  false, false, true,
   ARRAY['public','agency']::text[], 370, 'Free-form discoverability tags.'),
  ('identity.gender',  'Gender',        'Género',             'universal', 'identity',   'select',
   true, true, true,  true,  false, false, false, true,
   ARRAY['public','agency']::text[], 50,  'Public-facing gender filter facet. Sourced from talent_profiles.gender — never freeform.')
ON CONFLICT (field_key) DO NOTHING;

-- ─── Sub-Task 0: backfill canonical sub-surface flags from legacy ────────────
--
-- Mapping table inline below. Source: OLD_TO_NEW_KEY in
-- web/src/lib/fields/legacy-mirror.ts (the 17 bridged keys) + the 7 taxonomy
-- section keys covered by Sub-Task 0.5 (5 inserted above + skills + languages
-- already-canonical). Where the legacy row is absent, we leave canonical at
-- the column default (false) — these are fields that never had legacy
-- visibility, so "public off" is the safe baseline.

WITH legacy_canonical_pairs(canonical_key, legacy_key) AS (
  VALUES
    -- Bridged physical / experience / availability / travel / media (17 keys):
    ('physical.body_type',                  'body_type'),
    ('physical.dress_size',                 'clothing_size'),
    ('identity.dob',                        'date_of_birth'),
    ('physical.eye_color',                  'eye_color'),
    ('physical.hair_color',                 'hair_color'),
    ('physical.hair_length',                'hair_length'),
    ('physical.height_cm',                  'height_cm'),
    ('physical.shoe_size_eu',               'shoe_size'),
    ('experience.years_total',              'years_experience'),
    ('experience.level',                    'experience_level'),
    ('experience.notable_work',             'notable_work'),
    ('experience.professional_highlights',  'professional_highlights'),
    ('availability.status',                 'availability_status'),
    ('availability.available_for',          'available_for'),
    ('travel.willing',                      'willing_to_travel'),
    ('travel.scope',                        'travel_scope'),
    ('media.website_url',                   'website_url'),
    -- Phase 2 Sub-Task 0.5 — taxonomy / section gate keys:
    ('skills',                              'skills'),
    ('languages',                           'languages'),
    ('fit_labels',                          'fit_labels'),
    ('industries',                          'industries'),
    ('event_types',                         'event_types'),
    ('tags',                                'tags'),
    ('identity.gender',                     'gender')
)
UPDATE public.profile_field_definitions pfd
SET
  show_in_directory_filter       = COALESCE(fd.directory_filter_visible, false),
  show_in_directory_card         = COALESCE(fd.card_visible,             false),
  show_in_public_profile_sidebar = COALESCE(fd.profile_visible,          false),
  updated_at                     = now()
FROM legacy_canonical_pairs lcp
JOIN public.field_definitions fd
  ON fd.key       = lcp.legacy_key
 AND fd.tenant_id IS NULL
WHERE pfd.field_key = lcp.canonical_key;

-- ─── Sub-Task 0: backfill per-tenant overrides from legacy clone rows ────────
--
-- Phase 1.1 doc §5 R8 — before Phase 5 deletes legacy, any tenant that
-- customized a bridged key by writing a tenant-scoped field_definitions row
-- (`tenant_id IS NOT NULL`) must be carried over to
-- workspace_profile_field_settings, or their customization regresses to
-- canonical defaults when the legacy table is dropped.
--
-- Empirical check 2026-05-27 (run during scope verification):
--   `SELECT count(*) FROM field_definitions WHERE tenant_id IS NOT NULL;`
--   returned 0 rows. The carryover is a structural correctness no-op today,
--   but we include it so the migration is idempotent and Phase 5 can run
--   without re-introducing this query.

WITH legacy_canonical_pairs(canonical_key, legacy_key) AS (
  VALUES
    ('physical.body_type',                  'body_type'),
    ('physical.dress_size',                 'clothing_size'),
    ('identity.dob',                        'date_of_birth'),
    ('physical.eye_color',                  'eye_color'),
    ('physical.hair_color',                 'hair_color'),
    ('physical.hair_length',                'hair_length'),
    ('physical.height_cm',                  'height_cm'),
    ('physical.shoe_size_eu',               'shoe_size'),
    ('experience.years_total',              'years_experience'),
    ('experience.level',                    'experience_level'),
    ('experience.notable_work',             'notable_work'),
    ('experience.professional_highlights',  'professional_highlights'),
    ('availability.status',                 'availability_status'),
    ('availability.available_for',          'available_for'),
    ('travel.willing',                      'willing_to_travel'),
    ('travel.scope',                        'travel_scope'),
    ('media.website_url',                   'website_url'),
    ('skills',                              'skills'),
    ('languages',                           'languages'),
    ('fit_labels',                          'fit_labels'),
    ('industries',                          'industries'),
    ('event_types',                         'event_types'),
    ('tags',                                'tags'),
    ('identity.gender',                     'gender')
),
tenant_legacy_rows AS (
  SELECT
    fd.tenant_id                AS tenant_id,
    pfd.id                      AS field_definition_id,
    fd.directory_filter_visible AS directory_filter_visible,
    fd.card_visible             AS card_visible,
    fd.profile_visible          AS profile_visible,
    fd.public_visible           AS public_visible
  FROM public.field_definitions fd
  JOIN legacy_canonical_pairs lcp
    ON lcp.legacy_key = fd.key
  JOIN public.profile_field_definitions pfd
    ON pfd.field_key = lcp.canonical_key
  WHERE fd.tenant_id IS NOT NULL
)
INSERT INTO public.workspace_profile_field_settings (
  tenant_id,
  field_definition_id,
  show_in_directory_filter_override,
  show_in_directory_card_override,
  show_in_public_profile_sidebar_override,
  show_in_public_override
)
SELECT
  tenant_id,
  field_definition_id,
  -- Only emit an override when the legacy clone diverges from canonical
  -- default (false). Same shape on all three sub-surfaces.
  CASE WHEN directory_filter_visible IS NOT NULL THEN directory_filter_visible END,
  CASE WHEN card_visible             IS NOT NULL THEN card_visible             END,
  CASE WHEN profile_visible          IS NOT NULL THEN profile_visible          END,
  CASE WHEN public_visible           IS NOT NULL THEN public_visible           END
FROM tenant_legacy_rows
ON CONFLICT (tenant_id, field_definition_id)
DO UPDATE SET
  show_in_directory_filter_override       = COALESCE(public.workspace_profile_field_settings.show_in_directory_filter_override,       EXCLUDED.show_in_directory_filter_override),
  show_in_directory_card_override         = COALESCE(public.workspace_profile_field_settings.show_in_directory_card_override,         EXCLUDED.show_in_directory_card_override),
  show_in_public_profile_sidebar_override = COALESCE(public.workspace_profile_field_settings.show_in_public_profile_sidebar_override, EXCLUDED.show_in_public_profile_sidebar_override),
  show_in_public_override                 = COALESCE(public.workspace_profile_field_settings.show_in_public_override,                 EXCLUDED.show_in_public_override),
  updated_at                              = now();

-- ─── Sub-Task 1: extend agency_taxonomy_settings ────────────────────────────
--
-- The task brief specified a new workspace_taxonomy_overrides table. During
-- the scope-verification pass (before this migration was written) I found
-- agency_taxonomy_settings already implementing 90% of that table:
--   tenant_id, taxonomy_term_id (UNIQUE), is_enabled, custom_label,
--   display_order, show_in_directory, show_in_registration,
--   allow_as_primary, allow_as_secondary, helper_text, requires_approval,
--   created_at, updated_at, plus an entire UI (LiveTalentTypesDrawer) +
--   server actions (setTaxonomyFlags / setTaxonomyEnabled) + readers
--   (taxonomy-tenant-safety.ts, taxonomy-filters.ts, talent-taxonomy-
--   service.ts) + 1051-1085 rows per tenant from prior Impronta curation.
--   Plan-tier scope confirmed: free / studio / agency / network all have
--   rows; "agency_" prefix is legacy nomenclature meaning "tenant".
--
-- Extending the existing table is non-destructive (adds nullable columns),
-- avoids a second source of truth, and means the existing UI / readers /
-- 8000+ rows of curation data continue to work without churn.
--
-- Missing from the task spec: custom_label_es (Spanish label override) and
-- created_by_user_id (audit field on the row itself; engine_audit_log
-- already records the actor for every write).

ALTER TABLE public.agency_taxonomy_settings
  ADD COLUMN IF NOT EXISTS custom_label_es     text,
  ADD COLUMN IF NOT EXISTS created_by_user_id  uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.agency_taxonomy_settings.custom_label_es IS
  'Phase 2 (Sub-Task 1): tenant-scoped Spanish label override for this taxonomy term. NULL = fall back to taxonomy_terms.name_es. Mirrors custom_label (EN).';

COMMENT ON COLUMN public.agency_taxonomy_settings.created_by_user_id IS
  'Phase 2 (Sub-Task 1): user who first wrote the override row, set at insert. Mirrors workspace_profile_field_settings.last_changed_by_user_id but pinned at insert because most edits use the same actor; engine_audit_log carries the full per-edit history.';

-- ─── Audit trail ────────────────────────────────────────────────────────────
-- engine_audit_log.tenant_id is NOT NULL, so a platform-wide schema change
-- can't sit there. The durable audit trail for this migration is the
-- migration filename itself + the schema_migrations row that apply-migration
-- inserts on success. Comments above carry the human-readable rationale.

COMMIT;
