-- Impronta launch follow-up: disable the `home-fixer` leaf for the
-- Impronta tenant only.
--
-- Phase 3 (qa-evidence/impronta-taxonomy-curation-20260527/db-verification.json)
-- surfaced this leaf as orphan-enabled — the launch keep list never named
-- it, but a prior settings row left it enabled. It is a home-repair /
-- handyman service, off-brand for an editorial talent agency.
--
-- Non-destructive: taxonomy_terms row stays, this only flips the per-tenant
-- agency_taxonomy_settings flag. Other tenants are unaffected because the
-- INSERT/UPDATE is scoped via WHERE a.slug = 'impronta'.

BEGIN;

INSERT INTO public.agency_taxonomy_settings (
  tenant_id,
  taxonomy_term_id,
  is_enabled,
  show_in_registration,
  show_in_directory,
  allow_as_primary,
  allow_as_secondary,
  updated_at
)
SELECT
  a.id,
  t.id,
  false,
  false,
  false,
  false,
  false,
  now()
FROM public.agencies a
CROSS JOIN public.taxonomy_terms t
WHERE a.slug = 'impronta'
  AND t.slug = 'home-fixer'
ON CONFLICT (tenant_id, taxonomy_term_id)
DO UPDATE SET
  is_enabled = false,
  show_in_registration = false,
  show_in_directory = false,
  allow_as_primary = false,
  allow_as_secondary = false,
  updated_at = now();

-- Audit row — keeps the engine_audit_log consistent with the
-- platform-level curation pattern (see 20261003000000_impronta_launch_taxonomy_curation.sql).
-- Column names match the canonical engine_audit_log schema
-- (20260520044731_engine_audit_log.sql): operation (not "action"),
-- subject_id as uuid, subject_key for the human-readable handle; no
-- "notes" column — the human note rides in after_value.
INSERT INTO public.engine_audit_log (
  tenant_id,
  actor_user_id,
  actor_role,
  surface,
  subject_kind,
  subject_id,
  subject_key,
  operation,
  before_value,
  after_value
)
SELECT
  a.id,
  NULL,
  'system_migration',
  'taxonomy',
  'agency_taxonomy_settings',
  t.id,
  t.slug,
  'disable',
  jsonb_build_object('is_enabled', true, 'reason', 'orphan-enabled after launch curation'),
  jsonb_build_object(
    'is_enabled', false,
    'reason', 'off-brand for Impronta (home repair / handyman)',
    'migration', '20260527174407_impronta_disable_home_fixer_leaf — Phase 3 follow-up'
  )
FROM public.agencies a
CROSS JOIN public.taxonomy_terms t
WHERE a.slug = 'impronta'
  AND t.slug = 'home-fixer';

COMMIT;
