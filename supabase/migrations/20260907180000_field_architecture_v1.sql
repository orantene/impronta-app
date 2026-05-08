-- ============================================================================
-- Field Architecture V1 — 2026-05-07
-- ============================================================================
--
-- WHY
-- ───
-- After taxonomy_cleanup_v1 (terms) and field_reconciliation_v1 (fields),
-- the catalog is clean. This migration installs the architecture that
-- powers dynamic field rendering:
--
--   • profile_field_groups        — the 13 reusable field bundles.
--   • profile_field_definitions   — gets field_group_id, validation_rules,
--                                   show_when columns.
--   • parent_category_field_groups— maps which groups auto-load per parent.
--   • profile_field_recommendations — gets 5 requirement-level columns.
--   • workspace_field_group_settings — per-tenant overrides at group level.
--
-- Plus several first-class concepts that are NOT field-catalog entries:
--
--   • talent_profile_trust_badges — verification workflow badges.
--   • talent_agency_permission_requests — OAuth-style consent screens.
--   • talent_agency_data_grants   — active per-agency data scope grants.
--   • talent_profile_external_calendars — Calendly/Google/iCal links.
--   • agency_talent_media         — two-layer photo curation per tenant.
--
-- Plus 3 new columns on talent_profiles for earned-trust foundations.
-- Plus media_assets ownership extension (talent vs agency vs platform).
--
-- WHAT
-- ────
-- 1. Schema additions (10 tables/column groups).
-- 2. Seed 13 field groups with Spanish translations.
-- 3. Seed parent_category_field_groups mappings (~120 rows).
-- 4. Backfill field_group_id on existing definitions where the assignment
--    is unambiguous (physical.*, media.*, experience.*, etc.).
--
-- This migration ADDS NO NEW FIELD ROWS. Phase 4 (field_seeds_v1) handles
-- the 6 priority talent_types. This migration is pure architecture +
-- group seeding + group-id backfill.
--
-- IDEMPOTENCY: every block guarded.
-- ============================================================================

BEGIN;

-- ─── 1. Schema: profile_field_groups ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.profile_field_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name_en TEXT NOT NULL,
  name_es TEXT,
  description_en TEXT,
  description_es TEXT,
  sort_order INT NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.profile_field_groups IS
  '13 reusable field bundles (Physical/Casting, Media/Portfolio, etc.). Parent categories auto-load groups via parent_category_field_groups.';

-- ─── 2. Add field_group_id, validation_rules, show_when to definitions ──────

ALTER TABLE public.profile_field_definitions
  ADD COLUMN IF NOT EXISTS field_group_id UUID REFERENCES public.profile_field_groups(id);

ALTER TABLE public.profile_field_definitions
  ADD COLUMN IF NOT EXISTS validation_rules JSONB;

ALTER TABLE public.profile_field_definitions
  ADD COLUMN IF NOT EXISTS show_when JSONB;

COMMENT ON COLUMN public.profile_field_definitions.field_group_id IS
  'FK to profile_field_groups. NULL for universal/global fields that always render. Type-specific fields belong to a group; the group is auto-loaded when a parent_category recommends it via parent_category_field_groups.';

COMMENT ON COLUMN public.profile_field_definitions.validation_rules IS
  'JSONB constraints: {min, max, regex, enum, etc.} consumed by frontend form validators. Schema is open-ended; conventions documented in EXEC_PLAN_field_architecture_v1.md.';

COMMENT ON COLUMN public.profile_field_definitions.show_when IS
  'JSONB conditional visibility: {"field_key": "...", "operator": "equals|in|not_null", "value": ...}. Frontend engine evaluates this to hide/show the field based on other field values.';

-- ─── 3. parent_category_field_groups ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.parent_category_field_groups (
  parent_category_id UUID NOT NULL REFERENCES public.taxonomy_terms(id) ON DELETE CASCADE,
  field_group_id UUID NOT NULL REFERENCES public.profile_field_groups(id) ON DELETE CASCADE,
  is_default BOOLEAN NOT NULL DEFAULT true,
  weight TEXT NOT NULL DEFAULT 'default'
    CHECK (weight IN ('default','heavy','light','optional')),
  display_order INT NOT NULL DEFAULT 100,
  in_registration_wizard BOOLEAN NOT NULL DEFAULT false,
  in_profile_editor BOOLEAN NOT NULL DEFAULT true,
  completeness_weight DECIMAL(3,2) NOT NULL DEFAULT 1.0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (parent_category_id, field_group_id)
);

COMMENT ON TABLE public.parent_category_field_groups IS
  'Decides which field groups auto-load when a talent picks a parent_category. weight controls importance for completeness scoring; in_registration_wizard surfaces in the initial signup; in_profile_editor in the post-signup editor.';

-- ─── 4. profile_field_recommendations: 5 requirement-level columns ─────────

ALTER TABLE public.profile_field_recommendations
  ADD COLUMN IF NOT EXISTS required_at_registration BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS required_before_publish BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS required_before_verification BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_admin_only BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS requires_verification BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profile_field_recommendations.required_at_registration IS
  'Field MUST be filled to submit registration form (typically light V1 set: name, photo, primary type, home base, contact).';

COMMENT ON COLUMN public.profile_field_recommendations.required_before_publish IS
  'Field MUST be filled before profile flips from draft → published (visible to clients).';

COMMENT ON COLUMN public.profile_field_recommendations.required_before_verification IS
  'Field MUST be filled before talent can apply for verified-tier trust badge.';

COMMENT ON COLUMN public.profile_field_recommendations.is_admin_only IS
  'Talent does not see / edit this field. Admins/agency staff fill it.';

COMMENT ON COLUMN public.profile_field_recommendations.requires_verification IS
  'Field is talent-edited but flagged for admin review before counting as verified.';

-- ─── 5. workspace_field_group_settings (per-tenant group overrides) ─────────

CREATE TABLE IF NOT EXISTS public.workspace_field_group_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  field_group_id UUID NOT NULL REFERENCES public.profile_field_groups(id) ON DELETE CASCADE,
  is_enabled BOOLEAN,
  show_in_registration BOOLEAN,
  show_in_profile_edit BOOLEAN,
  show_in_public_profile BOOLEAN,
  display_order INT,
  custom_label TEXT,
  helper_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, field_group_id)
);

COMMENT ON TABLE public.workspace_field_group_settings IS
  'Tenants can enable/disable, reorder, relabel field groups for their workspace. Sparse — only override rows present.';

-- ─── 6. talent_profiles: 3 earned-trust foundation columns ──────────────────

ALTER TABLE public.talent_profiles
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS profile_completeness_pct SMALLINT
    CHECK (profile_completeness_pct IS NULL OR profile_completeness_pct BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS total_completed_bookings INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.talent_profiles.last_active_at IS
  'Updated on login + profile edit. Drives "Active 2 days ago" indicator on profile.';

COMMENT ON COLUMN public.talent_profiles.profile_completeness_pct IS
  '0-100. Computed nightly from required_before_publish field fill rate weighted by completeness_weight in parent_category_field_groups. NULL = not yet computed.';

COMMENT ON COLUMN public.talent_profiles.total_completed_bookings IS
  'Increments when a booking transitions to status=completed. Display alongside response rate as earned-trust signal.';

-- ─── 7. talent_profile_trust_badges (separate first-class concept) ──────────

CREATE TABLE IF NOT EXISTS public.talent_profile_trust_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  talent_profile_id UUID NOT NULL REFERENCES public.talent_profiles(id) ON DELETE CASCADE,
  badge_kind TEXT NOT NULL,
    -- 'identity', 'background_check', 'license', 'insurance',
    -- 'social_account', 'media_authentic', 'agency_approved'
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','verified','rejected','expired')),
  scope TEXT NOT NULL DEFAULT 'platform'
    CHECK (scope IN ('platform','agency')),
  scope_tenant_id UUID REFERENCES public.agencies(id),
  evidence_media_id UUID REFERENCES public.media_assets(id),
  verified_at TIMESTAMPTZ,
  verified_by_user_id UUID,
  expires_at TIMESTAMPTZ,
  rejection_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Agency-scoped badges must have a tenant; platform-scoped must not.
  CONSTRAINT trust_badge_scope_check CHECK (
    (scope = 'agency' AND scope_tenant_id IS NOT NULL)
    OR (scope = 'platform' AND scope_tenant_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_trust_badges_talent ON public.talent_profile_trust_badges(talent_profile_id);
CREATE INDEX IF NOT EXISTS idx_trust_badges_tenant ON public.talent_profile_trust_badges(scope_tenant_id) WHERE scope_tenant_id IS NOT NULL;

COMMENT ON TABLE public.talent_profile_trust_badges IS
  'Verification badges earned by talent. Platform-scoped (Tulala-verified) or agency-scoped (verified by a specific tenant). Surfaced as badges on profile, not editable fields.';

-- ─── 8. talent_agency_permission_requests (OAuth-style consent) ─────────────

CREATE TABLE IF NOT EXISTS public.talent_agency_permission_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  talent_profile_id UUID NOT NULL REFERENCES public.talent_profiles(id) ON DELETE CASCADE,
  requesting_tenant_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  requested_scopes TEXT[] NOT NULL,
    -- Subset of: identity, media, rates, service_areas, availability,
    -- documents, physical, experience
  request_message TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','denied','expired','cancelled')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '30 days',
  approved_scopes TEXT[],
  responded_by_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_perm_req_talent ON public.talent_agency_permission_requests(talent_profile_id, status);
CREATE INDEX IF NOT EXISTS idx_perm_req_tenant ON public.talent_agency_permission_requests(requesting_tenant_id, status);

COMMENT ON TABLE public.talent_agency_permission_requests IS
  'OAuth-style consent flow when an agency wants to roster a CLAIMED talent. Talent reviews requested_scopes and approves/denies (potentially with a subset).';

-- ─── 9. talent_agency_data_grants (active per-agency scopes) ────────────────

CREATE TABLE IF NOT EXISTS public.talent_agency_data_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  talent_profile_id UUID NOT NULL REFERENCES public.talent_profiles(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  granted_scopes TEXT[] NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  source_request_id UUID REFERENCES public.talent_agency_permission_requests(id),
  granted_by_user_id UUID,
  UNIQUE (talent_profile_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_data_grants_tenant_active ON public.talent_agency_data_grants(tenant_id) WHERE revoked_at IS NULL;

COMMENT ON TABLE public.talent_agency_data_grants IS
  'Active grants of data scopes per (talent, tenant). Talent can revoke any time (sets revoked_at). One row per pair (UNIQUE constraint).';

-- ─── 10. talent_profile_external_calendars ──────────────────────────────────

CREATE TABLE IF NOT EXISTS public.talent_profile_external_calendars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  talent_profile_id UUID NOT NULL REFERENCES public.talent_profiles(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('calendly','google','ical','cal_com','manual')),
  external_url TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  display_in_profile BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_external_cals_talent ON public.talent_profile_external_calendars(talent_profile_id);

COMMENT ON TABLE public.talent_profile_external_calendars IS
  'External calendar links (Calendly, Google, iCal feed, cal.com). One row per integration. Replaces self-reported availability toggles in V2.';

-- ─── 11. media_assets ownership extension ──────────────────────────────────

ALTER TABLE public.media_assets
  ADD COLUMN IF NOT EXISTS ownership_kind TEXT NOT NULL DEFAULT 'talent'
    CHECK (ownership_kind IN ('talent','agency','platform'));

ALTER TABLE public.media_assets
  ADD COLUMN IF NOT EXISTS owner_tenant_id UUID REFERENCES public.agencies(id);

ALTER TABLE public.media_assets
  ADD COLUMN IF NOT EXISTS visible_on_master_profile BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.media_assets
  ADD COLUMN IF NOT EXISTS visible_in_talent_editor BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.media_assets
  ADD COLUMN IF NOT EXISTS attribution_note TEXT;

-- Constraint: agency-owned photos must have owner_tenant_id set.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'media_assets_agency_ownership_chk'
  ) THEN
    ALTER TABLE public.media_assets
      ADD CONSTRAINT media_assets_agency_ownership_chk CHECK (
        (ownership_kind = 'agency' AND owner_tenant_id IS NOT NULL)
        OR (ownership_kind <> 'agency')
      );
  END IF;
END $$;

COMMENT ON COLUMN public.media_assets.ownership_kind IS
  'Who owns/copyright this asset: talent (uploaded by talent), agency (uploaded by agency staff for branded use), platform (Tulala-managed). Agency-owned photos can still appear on talent master profile if visible_on_master_profile is true.';

-- ─── 12. agency_talent_media (per-tenant photo curation layer) ──────────────

CREATE TABLE IF NOT EXISTS public.agency_talent_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  talent_profile_id UUID NOT NULL REFERENCES public.talent_profiles(id) ON DELETE CASCADE,
  -- If set, this row OVERRIDES one of the talent's media_assets on this
  -- tenant's branded surfaces (different crop / edit / replacement).
  -- NULL = agency-original photo (no master photo replaced).
  master_media_id UUID REFERENCES public.media_assets(id),
  agency_media_id UUID NOT NULL REFERENCES public.media_assets(id),
  display_order INT NOT NULL DEFAULT 100,
  caption TEXT,
  is_visible_on_agency_site BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_user_id UUID,
  UNIQUE (tenant_id, talent_profile_id, agency_media_id)
);

CREATE INDEX IF NOT EXISTS idx_agency_media_tenant ON public.agency_talent_media(tenant_id, talent_profile_id);

COMMENT ON TABLE public.agency_talent_media IS
  'Per-tenant photo curation. Two roles: (1) override — replace one of talent master photos on this agency site (master_media_id NOT NULL); (2) addition — agency uploads a new photo for this talent (master_media_id IS NULL). Agency-owned photos may also appear on talent master profile via media_assets.visible_on_master_profile.';

-- ─── 13. SEED: 13 field groups ─────────────────────────────────────────────

INSERT INTO public.profile_field_groups (slug, name_en, name_es, description_en, description_es, sort_order)
VALUES
  ('physical-casting',         'Physical / Casting',          'Físico / Casting',
   'Body measurements, hair/eye/skin, sizes, visible marks. Used by Models, Hosts, Performers, Sports & Fitness.',
   'Medidas corporales, color de cabello/ojos/piel, tallas, marcas visibles.',
   10),
  ('media-portfolio',          'Media / Portfolio',           'Media / Portafolio',
   'Headshots, gallery, showreel, social links, portfolio.',
   'Fotos profesionales, galería, showreel, redes sociales, portafolio.',
   20),
  ('experience',               'Experience',                  'Experiencia',
   'Years of experience, past clients, credits, references, training.',
   'Años de experiencia, clientes pasados, créditos, referencias, capacitación.',
   30),
  ('service-area-travel',      'Service Area / Travel',       'Zona de Servicio / Viajes',
   'Home base, service cities, travel radius, passport, transportation.',
   'Base, ciudades de servicio, radio de viaje, pasaporte, transporte.',
   40),
  ('languages-communication',  'Languages / Communication',   'Idiomas / Comunicación',
   'Languages spoken with proficiency. Communication strengths.',
   'Idiomas con nivel. Fortalezas de comunicación.',
   50),
  ('sales-client-interaction', 'Sales / Client Interaction',  'Ventas / Atención al Cliente',
   'Sales experience, cash handling, VIP handling. Used by Hosts, Travel, Promo Models.',
   'Experiencia en ventas, manejo de efectivo, atención VIP.',
   60),
  ('equipment-tools',          'Equipment / Tools',           'Equipo / Herramientas',
   'Equipment owned. Used by Music, Photo, Chefs, Wellness, Production, Home Services.',
   'Equipo propio.',
   70),
  ('certifications-documents', 'Certifications / Documents',  'Certificaciones / Documentos',
   'Licenses, certifications, insurance, background checks. Heavy use by Drivers, Chefs, Childcare, Security, Wellness.',
   'Licencias, certificaciones, seguros.',
   80),
  ('rates-booking',            'Rates / Booking Terms',       'Tarifas / Condiciones',
   'Hourly/day/event rates, packages, deposit, cancellation policy.',
   'Tarifas, paquetes, depósito, política de cancelación.',
   90),
  ('availability',             'Availability',                'Disponibilidad',
   'Available days/hours, advance notice, response time, blackout dates.',
   'Días/horas disponibles, aviso anticipado, tiempo de respuesta.',
   100),
  ('context-best-fit',         'Best Fit / Contexts',         'Mejor Uso / Contexto',
   'Event types and venues this talent fits best (UI maps to talent_profile_taxonomy contexts).',
   'Tipos de eventos y lugares ideales para este talento.',
   110),
  ('operational-requirements', 'Operational Requirements',    'Requisitos Operativos',
   'Setup needs (sound, stage, parking, power). Used by Performers, Music, Chefs, Photo, Production.',
   'Necesidades de montaje (sonido, escenario, estacionamiento, electricidad).',
   120),
  ('trust-verification',       'Trust / Verification',        'Confianza / Verificación',
   'Verification badges (identity, license, insurance, background). Surfaced as badges, not editable fields.',
   'Insignias de verificación (identidad, licencia, seguro, antecedentes).',
   130)
ON CONFLICT (slug) DO NOTHING;

-- ─── 14. SEED: backfill field_group_id on existing definitions ──────────────
-- Where the assignment is unambiguous from field_key prefix.

UPDATE public.profile_field_definitions
SET field_group_id = (SELECT id FROM public.profile_field_groups WHERE slug = 'physical-casting')
WHERE deprecated_at IS NULL
  AND field_group_id IS NULL
  AND (field_key LIKE 'physical.%' OR field_key LIKE 'measurements.%');

UPDATE public.profile_field_definitions
SET field_group_id = (SELECT id FROM public.profile_field_groups WHERE slug = 'media-portfolio')
WHERE deprecated_at IS NULL
  AND field_group_id IS NULL
  AND (field_key LIKE 'media.%'
       OR field_key IN ('media.social_links', 'creator.instagram_handle',
                        'creator.tiktok_handle', 'creator.youtube_channel'));

UPDATE public.profile_field_definitions
SET field_group_id = (SELECT id FROM public.profile_field_groups WHERE slug = 'experience')
WHERE deprecated_at IS NULL
  AND field_group_id IS NULL
  AND (field_key LIKE 'experience.%'
       OR field_key IN ('credits', 'reviews'));

UPDATE public.profile_field_definitions
SET field_group_id = (SELECT id FROM public.profile_field_groups WHERE slug = 'service-area-travel')
WHERE deprecated_at IS NULL
  AND field_group_id IS NULL
  AND (field_key LIKE 'service.%'
       OR field_key LIKE 'travel.%'
       OR field_key IN ('identity.home_country'));

UPDATE public.profile_field_definitions
SET field_group_id = (SELECT id FROM public.profile_field_groups WHERE slug = 'rates-booking')
WHERE deprecated_at IS NULL
  AND field_group_id IS NULL
  AND (field_key = 'rates'
       OR field_key LIKE 'creator.rate_%'
       OR field_key LIKE 'chef.private_chef_day_rate'
       OR field_key = 'chef.tasting_menu_per_person');

UPDATE public.profile_field_definitions
SET field_group_id = (SELECT id FROM public.profile_field_groups WHERE slug = 'certifications-documents')
WHERE deprecated_at IS NULL
  AND field_group_id IS NULL
  AND (field_key = 'documents'
       OR field_key LIKE '%insurance%'
       OR field_key LIKE '%license%'
       OR field_key LIKE '%certifications%'
       OR field_key IN ('event.first_aid_certified', 'photo.drone_licensed',
                        'security.weapons_certified', 'security.training',
                        'security.close_protection_certified',
                        'hosp.mixology_certified', 'transport.license_class'));

UPDATE public.profile_field_definitions
SET field_group_id = (SELECT id FROM public.profile_field_groups WHERE slug = 'availability')
WHERE deprecated_at IS NULL
  AND field_group_id IS NULL
  AND (field_key = 'identity.response_time'
       OR field_key = 'event.max_shift_hours'
       OR field_key = 'transport.max_run_hours');

UPDATE public.profile_field_definitions
SET field_group_id = (SELECT id FROM public.profile_field_groups WHERE slug = 'operational-requirements')
WHERE deprecated_at IS NULL
  AND field_group_id IS NULL
  AND (field_key IN ('performer.requires_rigging','music.tech_rider',
                     'photo.has_studio_access','chef.kitchen_requirements'));

UPDATE public.profile_field_definitions
SET field_group_id = (SELECT id FROM public.profile_field_groups WHERE slug = 'equipment-tools')
WHERE deprecated_at IS NULL
  AND field_group_id IS NULL
  AND (field_key IN ('music.equipment','performer.props_owned',
                     'photo.camera_brands','photo.kit_owned',
                     'wellness.travels_with_kit'));

-- Anything still NULL stays as type-specific (gets assigned via parent_category_field_groups).

-- ─── 15. SEED: parent_category_field_groups mappings ───────────────────────
-- Maps each of 19 parent_categories to their auto-loaded field groups.

CREATE TEMP TABLE _parent_group_mappings (
  parent_slug TEXT NOT NULL,
  group_slug TEXT NOT NULL,
  weight TEXT NOT NULL DEFAULT 'default',
  display_order INT NOT NULL DEFAULT 100,
  in_registration_wizard BOOLEAN NOT NULL DEFAULT false,
  in_profile_editor BOOLEAN NOT NULL DEFAULT true
) ON COMMIT DROP;

INSERT INTO _parent_group_mappings (parent_slug, group_slug, weight, display_order, in_registration_wizard) VALUES
  -- Models — physical/casting heavy, media essential
  ('models', 'physical-casting',         'heavy', 10,  true),
  ('models', 'media-portfolio',          'heavy', 20,  true),
  ('models', 'experience',               'default', 30, false),
  ('models', 'service-area-travel',      'default', 40, false),
  ('models', 'languages-communication',  'light',   50, false),
  ('models', 'rates-booking',            'default', 60, false),
  ('models', 'availability',             'default', 70, false),
  ('models', 'trust-verification',       'optional',80, false),

  -- Hosts & Promo
  ('hosts-promo', 'media-portfolio',          'light',  10, true),
  ('hosts-promo', 'languages-communication',  'heavy',  20, true),
  ('hosts-promo', 'sales-client-interaction', 'heavy',  30, false),
  ('hosts-promo', 'experience',               'default',40, false),
  ('hosts-promo', 'physical-casting',         'light',  50, false),
  ('hosts-promo', 'service-area-travel',      'default',60, false),
  ('hosts-promo', 'rates-booking',            'default',70, false),
  ('hosts-promo', 'availability',             'default',80, false),
  ('hosts-promo', 'trust-verification',       'optional',90,false),

  -- Performers
  ('performers', 'media-portfolio',           'heavy',  10, true),
  ('performers', 'experience',                'default',20, false),
  ('performers', 'physical-casting',          'light',  30, false),
  ('performers', 'equipment-tools',           'default',40, false),
  ('performers', 'operational-requirements',  'heavy',  50, false),
  ('performers', 'rates-booking',             'default',60, false),
  ('performers', 'availability',              'default',70, false),

  -- Music & DJs
  ('music-djs', 'media-portfolio',            'heavy',  10, true),
  ('music-djs', 'experience',                 'default',20, false),
  ('music-djs', 'equipment-tools',            'heavy',  30, false),
  ('music-djs', 'operational-requirements',   'heavy',  40, false),
  ('music-djs', 'service-area-travel',        'default',50, false),
  ('music-djs', 'rates-booking',              'default',60, false),
  ('music-djs', 'availability',               'default',70, false),

  -- Chefs & Culinary
  ('chefs-culinary', 'media-portfolio',           'default',10, true),
  ('chefs-culinary', 'experience',                'heavy',  20, false),
  ('chefs-culinary', 'equipment-tools',           'default',30, false),
  ('chefs-culinary', 'certifications-documents',  'heavy',  40, false),
  ('chefs-culinary', 'operational-requirements',  'heavy',  50, false),
  ('chefs-culinary', 'rates-booking',             'default',60, false),
  ('chefs-culinary', 'availability',              'default',70, false),
  ('chefs-culinary', 'languages-communication',   'light',  80, false),

  -- Wellness & Beauty
  ('wellness-beauty', 'experience',                'default',10, true),
  ('wellness-beauty', 'equipment-tools',           'default',20, false),
  ('wellness-beauty', 'certifications-documents',  'heavy',  30, false),
  ('wellness-beauty', 'rates-booking',             'default',40, false),
  ('wellness-beauty', 'availability',              'default',50, false),
  ('wellness-beauty', 'service-area-travel',       'default',60, false),
  ('wellness-beauty', 'languages-communication',   'light',  70, false),

  -- Photo, Video & Creative
  ('photo-video-creative', 'media-portfolio',          'heavy',  10, true),
  ('photo-video-creative', 'experience',               'default',20, false),
  ('photo-video-creative', 'equipment-tools',          'heavy',  30, false),
  ('photo-video-creative', 'operational-requirements', 'default',40, false),
  ('photo-video-creative', 'rates-booking',            'default',50, false),
  ('photo-video-creative', 'availability',             'default',60, false),

  -- Influencers & Creators
  ('influencers-creators', 'media-portfolio',          'heavy',  10, true),
  ('influencers-creators', 'experience',               'default',20, false),
  ('influencers-creators', 'sales-client-interaction', 'default',30, false),
  ('influencers-creators', 'rates-booking',            'default',40, false),
  ('influencers-creators', 'availability',             'default',50, false),
  ('influencers-creators', 'languages-communication',  'optional',60,false),

  -- Event Staff
  ('event-staff', 'experience',                'default',10, true),
  ('event-staff', 'languages-communication',   'default',20, false),
  ('event-staff', 'sales-client-interaction',  'light',  30, false),
  ('event-staff', 'service-area-travel',       'default',40, false),
  ('event-staff', 'rates-booking',             'default',50, false),
  ('event-staff', 'availability',              'default',60, false),
  ('event-staff', 'certifications-documents',  'optional',70,false),
  ('event-staff', 'trust-verification',        'optional',80,false),

  -- Hospitality & Property
  ('hospitality-property', 'experience',                'default',10, true),
  ('hospitality-property', 'languages-communication',   'default',20, false),
  ('hospitality-property', 'certifications-documents',  'default',30, false),
  ('hospitality-property', 'equipment-tools',           'light',  40, false),
  ('hospitality-property', 'service-area-travel',       'default',50, false),
  ('hospitality-property', 'rates-booking',             'default',60, false),
  ('hospitality-property', 'availability',              'default',70, false),
  ('hospitality-property', 'trust-verification',        'heavy',  80, false),

  -- Travel & Concierge
  ('travel-concierge', 'experience',                'default',10, true),
  ('travel-concierge', 'languages-communication',   'heavy',  20, false),
  ('travel-concierge', 'sales-client-interaction',  'heavy',  30, false),
  ('travel-concierge', 'service-area-travel',       'heavy',  40, false),
  ('travel-concierge', 'rates-booking',             'default',50, false),
  ('travel-concierge', 'availability',              'default',60, false),
  ('travel-concierge', 'trust-verification',        'heavy',  70, false),

  -- Transportation
  ('transportation', 'experience',                'default',10, true),
  ('transportation', 'equipment-tools',           'heavy',  20, false),
  ('transportation', 'certifications-documents',  'heavy',  30, false),
  ('transportation', 'service-area-travel',       'heavy',  40, false),
  ('transportation', 'rates-booking',             'default',50, false),
  ('transportation', 'availability',              'default',60, false),
  ('transportation', 'trust-verification',        'heavy',  70, false),

  -- Home & Technical Services
  ('home-technical-services', 'experience',                'default',10, true),
  ('home-technical-services', 'equipment-tools',           'heavy',  20, false),
  ('home-technical-services', 'certifications-documents',  'default',30, false),
  ('home-technical-services', 'rates-booking',             'default',40, false),
  ('home-technical-services', 'availability',              'default',50, false),
  ('home-technical-services', 'service-area-travel',       'default',60, false),
  ('home-technical-services', 'trust-verification',        'heavy',  70, false),

  -- Security & Protection
  ('security-protection', 'experience',                'default',10, true),
  ('security-protection', 'certifications-documents',  'heavy',  20, false),
  ('security-protection', 'service-area-travel',       'default',30, false),
  ('security-protection', 'rates-booking',             'default',40, false),
  ('security-protection', 'availability',              'default',50, false),
  ('security-protection', 'trust-verification',        'heavy',  60, false),

  -- Sports & Fitness
  ('sports-fitness', 'physical-casting',         'light',  10, false),
  ('sports-fitness', 'experience',               'default',20, true),
  ('sports-fitness', 'equipment-tools',          'light',  30, false),
  ('sports-fitness', 'certifications-documents', 'default',40, false),
  ('sports-fitness', 'rates-booking',            'default',50, false),
  ('sports-fitness', 'availability',             'default',60, false),
  ('sports-fitness', 'service-area-travel',      'default',70, false),

  -- Kids & Family Services
  ('kids-family-services', 'experience',                'default',10, true),
  ('kids-family-services', 'certifications-documents',  'heavy',  20, false),
  ('kids-family-services', 'languages-communication',   'default',30, false),
  ('kids-family-services', 'rates-booking',             'default',40, false),
  ('kids-family-services', 'availability',              'default',50, false),
  ('kids-family-services', 'trust-verification',        'heavy',  60, false),

  -- Speakers, Coaches & Experts
  ('speakers-coaches-experts', 'media-portfolio',          'default',10, true),
  ('speakers-coaches-experts', 'experience',               'heavy',  20, false),
  ('speakers-coaches-experts', 'languages-communication',  'default',30, false),
  ('speakers-coaches-experts', 'service-area-travel',      'default',40, false),
  ('speakers-coaches-experts', 'rates-booking',            'default',50, false),
  ('speakers-coaches-experts', 'availability',             'default',60, false),

  -- Production & Behind-the-Scenes
  ('production-bts', 'experience',                'default',10, true),
  ('production-bts', 'equipment-tools',           'default',20, false),
  ('production-bts', 'certifications-documents',  'light',  30, false),
  ('production-bts', 'operational-requirements',  'default',40, false),
  ('production-bts', 'rates-booking',             'default',50, false),
  ('production-bts', 'availability',              'default',60, false),

  -- Animals & Specialty Acts
  ('animals-specialty-acts', 'media-portfolio',          'default',10, true),
  ('animals-specialty-acts', 'experience',               'default',20, false),
  ('animals-specialty-acts', 'certifications-documents', 'default',30, false),
  ('animals-specialty-acts', 'equipment-tools',          'light',  40, false),
  ('animals-specialty-acts', 'operational-requirements', 'default',50, false),
  ('animals-specialty-acts', 'rates-booking',            'default',60, false),
  ('animals-specialty-acts', 'availability',             'default',70, false),
  ('animals-specialty-acts', 'trust-verification',       'optional',80,false);

-- Apply mappings: resolve slugs to IDs and INSERT.
INSERT INTO public.parent_category_field_groups
  (parent_category_id, field_group_id, weight, display_order, in_registration_wizard)
SELECT
  pc.id, fg.id, m.weight, m.display_order, m.in_registration_wizard
FROM _parent_group_mappings m
JOIN public.taxonomy_terms pc ON pc.slug = m.parent_slug AND pc.term_type = 'parent_category'
JOIN public.profile_field_groups fg ON fg.slug = m.group_slug
ON CONFLICT (parent_category_id, field_group_id) DO NOTHING;

-- ─── 16. Final assertion ───────────────────────────────────────────────────

DO $$
DECLARE
  group_count INT;
  mapping_count INT;
  defs_with_group INT;
BEGIN
  SELECT count(*) INTO group_count FROM public.profile_field_groups;
  SELECT count(*) INTO mapping_count FROM public.parent_category_field_groups;
  SELECT count(*) INTO defs_with_group FROM public.profile_field_definitions
    WHERE field_group_id IS NOT NULL AND deprecated_at IS NULL;

  IF group_count < 13 THEN
    RAISE EXCEPTION 'field_architecture_v1: expected ≥13 field groups, got %', group_count;
  END IF;

  IF mapping_count < 100 THEN
    RAISE EXCEPTION 'field_architecture_v1: expected ≥100 parent_category mappings, got %', mapping_count;
  END IF;

  RAISE NOTICE 'field_architecture_v1: % groups, % parent mappings, % active defs assigned to groups',
    group_count, mapping_count, defs_with_group;
END $$;

COMMIT;
