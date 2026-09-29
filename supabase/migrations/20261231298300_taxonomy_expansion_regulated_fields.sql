-- ============================================================================
-- 20261231298300_taxonomy_expansion_regulated_fields.sql
--
-- Taxonomy expansion, Phase 2B: trade fields for the REGULATED new groups
-- (regulated: True in taxonomy-proposal.py):
--   legal-services, finance-tax, dental-care, rehabilitation, mental-health,
--   medical-home-care, animal-health, architecture-interiors
-- (31 talent types in total).
--
-- Depends on 20261231298100 (creates the category_group + talent_type terms) and
-- on 20261231298200 (2A; owns svc.online_or_in_person, svc.home_visits and
-- pets.species, which this file only ATTACHES to regulated types).
-- Terms are referenced BY SLUG only. A preflight block below aborts the whole
-- migration if any expected group or type is missing, so it can never silently
-- insert zero recommendation rows.
--
-- WHAT
--   1. 13 new field definitions (2 private, 11 public trade facts).
--   2. 152 recommendation rows, attached at the TALENT TYPE level (every type
--      in a group, minus explicit per-field exclusions); 33 of them attach
--      the three 2A definitions listed above.
--
-- PRIVACY (regulated identity fields)
--   professional.license_number and professional.license_issuing_body are:
--     is_sensitive = true (platform floor: can never resolve to public),
--     show_in_public = false, show_in_directory* = false, filter/card/sidebar
--     = false, default_visibility = {agency} (never 'public'),
--     requires_review_on_change = true, show_in_registration = false.
--   Their recommendation rows carry requires_verification = true and
--   required_before_verification = true; required_at_registration and
--   required_before_publish stay false.
--   One SHARED definition is reused by all 8 groups (no per-profession copies).
--
-- REUSED (no new definitions): languages (universal), serviceArea.homeBase and
--   the talent_service_areas table (universal service area, so no zones field
--   for architecture), plus from 2A: svc.online_or_in_person (consultation
--   format), svc.home_visits (home visits), pets.species (animal health).
--
-- COPY RULES: Spanish helper text makes no outcome, cure or guarantee claims.
--   No em dashes in any label, helper or option.
--
-- IDEMPOTENT: definitions ON CONFLICT (field_key) DO NOTHING (+ a privacy
--   re-assert UPDATE for the two private keys); recommendations ON CONFLICT
--   (field_definition_id, taxonomy_term_id, relationship) DO NOTHING.
--   Purely additive. Does not touch any existing row except re-asserting the
--   privacy flags of the two keys it owns.
-- ============================================================================

BEGIN;

-- 0. Preflight: every group, type and reused 2A definition must exist
--    (migrations 298100 and 298200 applied).
DO $preflight$
DECLARE
  g RECORD;
  missing TEXT := '';
  n INT;
BEGIN
  FOR g IN SELECT * FROM (VALUES
  ('legal-services', ARRAY['immigration-lawyer', 'family-lawyer', 'contract-lawyer', 'labor-lawyer', 'real-estate-lawyer', 'criminal-lawyer']::text[]),
  ('finance-tax', ARRAY['accountant', 'tax-advisor', 'bookkeeper', 'insurance-broker', 'payroll-specialist', 'financial-advisor']::text[]),
  ('dental-care', ARRAY['dentist', 'dental-hygienist', 'orthodontist']::text[]),
  ('rehabilitation', ARRAY['physiotherapist', 'speech-therapist', 'occupational-therapist', 'chiropractor', 'podiatrist']::text[]),
  ('mental-health', ARRAY['psychologist', 'couples-therapist']::text[]),
  ('medical-home-care', ARRAY['home-doctor', 'home-nurse', 'elder-caregiver', 'nutritionist', 'optometrist']::text[]),
  ('animal-health', ARRAY['home-vet', 'equine-care']::text[]),
  ('architecture-interiors', ARRAY['architect', 'interior-designer']::text[])
  ) AS e(group_slug, type_slugs)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.taxonomy_terms
       WHERE slug = g.group_slug AND term_type = 'category_group'
    ) THEN
      missing := missing || ' group:' || g.group_slug;
    ELSE
      SELECT count(*) INTO n
        FROM public.taxonomy_terms tt
       WHERE tt.term_type = 'talent_type'
         AND tt.slug = ANY (g.type_slugs)
         AND tt.parent_id = (
           SELECT id FROM public.taxonomy_terms
            WHERE slug = g.group_slug AND term_type = 'category_group'
         );
      IF n <> array_length(g.type_slugs, 1) THEN
        missing := missing || ' types-of:' || g.group_slug
                   || '(' || n || '/' || array_length(g.type_slugs, 1) || ')';
      END IF;
    END IF;
  END LOOP;
  FOR g IN SELECT unnest(ARRAY['svc.online_or_in_person','svc.home_visits','pets.species']::text[]) AS field_key
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.profile_field_definitions
       WHERE field_key = g.field_key AND deprecated_at IS NULL
    ) THEN
      missing := missing || ' field:' || g.field_key;
    END IF;
  END LOOP;
  IF missing <> '' THEN
    RAISE EXCEPTION 'taxonomy_expansion_regulated_fields: apply 20261231298100 and 20261231298200 first, missing:%', missing;
  END IF;
END
$preflight$;

-- 1. Field definitions.
--    opts = [[en_value, es_label], ...]: options = the EN values (value == EN
--    label, catalog convention); option_labels_i18n = {value: {en, es}}.
--    Filter-enabled select/multiselect fields also get directory_filter_config
--    { "filter_options": [...] } (same shape as the existing facet config).
INSERT INTO public.profile_field_definitions
  (field_key, tier, section, kind, options,
   is_optional, is_sensitive, default_visibility,
   show_in_registration, show_in_edit_drawer, show_in_public, show_in_directory,
   admin_only, talent_editable, requires_review_on_change, is_searchable,
   display_order, field_group_id,
   show_in_directory_filter, show_in_directory_card, show_in_public_profile_sidebar,
   render_mode, storage_mode, directory_filter_config,
   label_i18n, helper_i18n, placeholder_i18n, option_labels_i18n, note)
SELECT
  v.field_key, 'type-specific', 'type-specific', v.kind, x.options,
  true, v.is_private,
  CASE WHEN v.is_private THEN ARRAY['agency']::text[] ELSE ARRAY['public','agency']::text[] END,
  NOT v.is_private, true, NOT v.is_private, false,
  false, true, v.is_private, false,
  v.display_order,
  (SELECT id FROM public.profile_field_groups WHERE slug = v.group_slug),
  v.is_filter, false, false,
  'catalog', 'field_values',
  CASE WHEN v.is_filter AND x.options IS NOT NULL
       THEN jsonb_build_object('filter_options', x.options) END,
  jsonb_build_object('en', v.label_en, 'es', v.label_es),
  jsonb_strip_nulls(jsonb_build_object('en', v.helper_en, 'es', v.helper_es)),
  jsonb_strip_nulls(jsonb_build_object('en', v.placeholder_en)),
  COALESCE(x.labels, '{}'::jsonb),
  'Taxonomy expansion 2B (regulated groups)'
FROM (VALUES
  ('professional.license_number'::text, 'text'::text, 'context-best-fit'::text, 200, NULL::jsonb, 'Professional license or registration number'::text, 'Número de cédula o licencia profesional'::text, 'Only the agency team sees this, to verify your profile. It is never shown publicly.'::text, 'Solo lo ve el equipo de la agencia para verificar tu perfil. Nunca se muestra en público.'::text, 'e.g. professional ID, bar or college registration'::text, true, false),
  ('professional.license_issuing_body'::text, 'text'::text, 'context-best-fit'::text, 210, NULL::jsonb, 'Issuing body or registry'::text, 'Institución o registro que la emite'::text, 'The school, college, board or registry that issued it. Only the agency team sees this.'::text, 'La universidad, colegio, consejo o registro que la emitió. Solo lo ve el equipo de la agencia.'::text, 'e.g. state professional college'::text, true, false),
  ('professional.age_groups'::text, 'multiselect'::text, 'context-best-fit'::text, 70, '[["Infants and toddlers", "Bebés y niños pequeños"], ["Children", "Niños"], ["Teens", "Adolescentes"], ["Adults", "Adultos"], ["Older adults", "Adultos mayores"]]'::jsonb, 'Age groups served'::text, 'Grupos de edad que atiendes'::text, 'Which age ranges you work with.'::text, 'Con qué rangos de edad trabajas.'::text, NULL::text, false, true),
  ('legal.practice_areas'::text, 'multiselect'::text, 'context-best-fit'::text, 10, '[["Immigration", "Migración"], ["Family", "Familiar"], ["Contracts and business", "Contratos y empresas"], ["Labor and employment", "Laboral"], ["Real estate", "Inmobiliario"], ["Criminal", "Penal"], ["Civil and commercial", "Civil y mercantil"], ["Wills and inheritance", "Sucesiones y testamentos"], ["Intellectual property", "Propiedad intelectual"], ["Tax", "Fiscal"]]'::jsonb, 'Practice areas'::text, 'Áreas de práctica'::text, 'Where you focus your practice.'::text, 'Las áreas en las que se enfoca tu práctica.'::text, NULL::text, false, true),
  ('finance.client_types'::text, 'multiselect'::text, 'context-best-fit'::text, 10, '[["Individuals", "Personas"], ["Freelancers", "Profesionistas independientes"], ["Small businesses", "Pequeños negocios"], ["Companies", "Empresas"], ["Nonprofits", "Organizaciones sin fines de lucro"]]'::jsonb, 'Client types'::text, 'Tipos de cliente'::text, 'Who you usually work with.'::text, 'Con quién sueles trabajar.'::text, NULL::text, false, true),
  ('finance.tax_regimes'::text, 'multiselect'::text, 'context-best-fit'::text, 20, '[["Salaried employees", "Sueldos y salarios"], ["Business and professional activity", "Actividad empresarial y profesional"], ["RESICO (simplified regime)", "RESICO"], ["Companies", "Personas morales"], ["Nonprofits", "Personas morales no lucrativas"], ["Digital platforms", "Plataformas digitales"], ["Foreign residents", "Residentes en el extranjero"]]'::jsonb, 'Tax regimes handled'::text, 'Regímenes fiscales que manejas'::text, 'The tax regimes you have experience with.'::text, 'Los regímenes fiscales en los que tienes experiencia.'::text, NULL::text, false, false),
  ('finance.software_used'::text, 'chips'::text, 'equipment-tools'::text, 30, NULL::jsonb, 'Accounting software used'::text, 'Software contable que usas'::text, NULL::text, NULL::text, 'Add a program...'::text, false, false),
  ('dental.specialties'::text, 'multiselect'::text, 'context-best-fit'::text, 10, '[["General dentistry", "Odontología general"], ["Orthodontics", "Ortodoncia"], ["Endodontics", "Endodoncia"], ["Periodontics", "Periodoncia"], ["Pediatric dentistry", "Odontopediatría"], ["Cosmetic dentistry", "Odontología estética"], ["Dental implants", "Implantes dentales"], ["Oral surgery", "Cirugía oral"], ["Cleaning and prevention", "Limpieza y prevención"]]'::jsonb, 'Dental specialties'::text, 'Especialidades dentales'::text, 'The areas of dentistry you offer.'::text, 'Las áreas de la odontología que ofreces.'::text, NULL::text, false, true),
  ('rehab.conditions_treated'::text, 'multiselect'::text, 'context-best-fit'::text, 10, '[["Back and neck", "Espalda y cuello"], ["Joints and sports injuries", "Articulaciones y lesiones deportivas"], ["Recovery after surgery", "Recuperación posterior a cirugía"], ["Neurological conditions", "Condiciones neurológicas"], ["Child development", "Desarrollo infantil"], ["Speech and language", "Lenguaje y comunicación"], ["Balance and mobility", "Equilibrio y movilidad"], ["Chronic pain", "Dolor crónico"], ["Feet and ankles", "Pies y tobillos"], ["Hand and upper limb", "Mano y miembro superior"]]'::jsonb, 'Conditions you work with'::text, 'Condiciones con las que trabajas'::text, 'The areas of care you have experience in.'::text, 'Las áreas de atención en las que tienes experiencia.'::text, NULL::text, false, true),
  ('mental.approach'::text, 'multiselect'::text, 'context-best-fit'::text, 10, '[["Cognitive-behavioral", "Cognitivo-conductual"], ["Psychodynamic", "Psicodinámico"], ["Humanistic", "Humanista"], ["Systemic and family", "Sistémico y familiar"], ["Gestalt", "Gestalt"], ["Mindfulness-based", "Basado en mindfulness"], ["Integrative", "Integrativo"], ["Solution-focused", "Centrado en soluciones"], ["EMDR", "EMDR"]]'::jsonb, 'Therapeutic approach'::text, 'Enfoque terapéutico'::text, 'The approaches you use in your practice.'::text, 'Los enfoques que utilizas en tu práctica.'::text, NULL::text, false, true),
  ('medhome.services_at_home'::text, 'multiselect'::text, 'context-best-fit'::text, 10, '[["Medical consultation", "Consulta médica"], ["Nursing care", "Cuidados de enfermería"], ["Wound care and dressings", "Curaciones y vendajes"], ["Elder care and companionship", "Cuidado y compañía de adultos mayores"], ["Personal care assistance", "Apoyo en cuidado personal"], ["Nutrition consultation", "Consulta de nutrición"], ["Eye exam", "Examen de la vista"], ["Post-surgery care", "Cuidados posoperatorios"]]'::jsonb, 'Services at home'::text, 'Servicios a domicilio'::text, 'What you can provide at the client''s home.'::text, 'Lo que puedes ofrecer en el domicilio del cliente.'::text, NULL::text, false, true),
  ('medhome.hours_available'::text, 'multiselect'::text, 'context-best-fit'::text, 20, '[["Weekday daytime", "Entre semana, de día"], ["Evenings", "Por la tarde"], ["Overnight", "Por la noche"], ["Weekends", "Fines de semana"], ["Live-in or 24-hour shifts", "Turnos de 24 horas o internado"], ["Same-day visits", "Visitas el mismo día"]]'::jsonb, 'Hours available'::text, 'Horarios disponibles'::text, 'When you can take visits or shifts.'::text, 'Cuándo puedes tomar visitas o turnos.'::text, NULL::text, false, false),
  ('arch.project_types'::text, 'multiselect'::text, 'context-best-fit'::text, 10, '[["New residential build", "Obra nueva residencial"], ["Renovation and remodeling", "Remodelación y renovación"], ["Interior design and decor", "Diseño de interiores y decoración"], ["Commercial and retail", "Comercial y retail"], ["Hospitality", "Hospitalidad"], ["Restoration and heritage", "Restauración y patrimonio"], ["Site supervision", "Supervisión de obra"], ["Landscape design", "Diseño de paisaje"]]'::jsonb, 'Project types'::text, 'Tipos de proyecto'::text, 'The kinds of projects you take on.'::text, 'Los tipos de proyecto que realizas.'::text, NULL::text, false, true)
) AS v(field_key, kind, group_slug, display_order, opts,
       label_en, label_es, helper_en, helper_es, placeholder_en,
       is_private, is_filter)
CROSS JOIN LATERAL (
  SELECT
    jsonb_agg(o.e ->> 0 ORDER BY o.n) AS options,
    jsonb_object_agg(o.e ->> 0, jsonb_build_object('en', o.e ->> 0, 'es', o.e ->> 1)) AS labels
  FROM jsonb_array_elements(v.opts) WITH ORDINALITY AS o(e, n)
) AS x
ON CONFLICT (field_key) DO NOTHING;

-- 2. Re-assert the privacy floor on the two private keys this migration owns
--    (guards against a pre-existing row with looser flags; no-op otherwise).
UPDATE public.profile_field_definitions
   SET is_sensitive = true,
       default_visibility = ARRAY['agency']::text[],
       show_in_public = false,
       show_in_directory = false,
       show_in_directory_filter = false,
       show_in_directory_card = false,
       show_in_public_profile_sidebar = false,
       show_in_registration = false,
       requires_review_on_change = true,
       updated_at = now()
 WHERE field_key IN ('professional.license_number', 'professional.license_issuing_body')
   AND (is_sensitive IS DISTINCT FROM true
        OR default_visibility IS DISTINCT FROM ARRAY['agency']::text[]
        OR show_in_public IS DISTINCT FROM false
        OR show_in_directory IS DISTINCT FROM false
        OR show_in_directory_filter IS DISTINCT FROM false
        OR show_in_directory_card IS DISTINCT FROM false
        OR show_in_public_profile_sidebar IS DISTINCT FROM false
        OR show_in_registration IS DISTINCT FROM false
        OR requires_review_on_change IS DISTINCT FROM true);

-- 3. Recommendations: field x every talent type of the group (by slug),
--    minus per-field exclusions. Private (licence) rows are verification-gated.
--    Includes the three reused 2A definitions (svc.*, pets.species).
INSERT INTO public.profile_field_recommendations
  (field_definition_id, taxonomy_term_id, relationship, display_order,
   required_at_registration, required_before_publish, required_before_verification,
   is_admin_only, requires_verification)
SELECT
  fd.id, tt.id, r.relationship, COALESCE(fd.display_order, 100),
  false, false, r.needs_verification,
  false, r.needs_verification
FROM (VALUES
  ('professional.license_number'::text, 'legal-services'::text, ARRAY[]::text[], 'applies'::text, true),
  ('professional.license_number'::text, 'finance-tax'::text, ARRAY[]::text[], 'applies'::text, true),
  ('professional.license_number'::text, 'dental-care'::text, ARRAY[]::text[], 'applies'::text, true),
  ('professional.license_number'::text, 'rehabilitation'::text, ARRAY[]::text[], 'applies'::text, true),
  ('professional.license_number'::text, 'mental-health'::text, ARRAY[]::text[], 'applies'::text, true),
  ('professional.license_number'::text, 'medical-home-care'::text, ARRAY[]::text[], 'applies'::text, true),
  ('professional.license_number'::text, 'animal-health'::text, ARRAY[]::text[], 'applies'::text, true),
  ('professional.license_number'::text, 'architecture-interiors'::text, ARRAY[]::text[], 'applies'::text, true),
  ('professional.license_issuing_body'::text, 'legal-services'::text, ARRAY[]::text[], 'applies'::text, true),
  ('professional.license_issuing_body'::text, 'finance-tax'::text, ARRAY[]::text[], 'applies'::text, true),
  ('professional.license_issuing_body'::text, 'dental-care'::text, ARRAY[]::text[], 'applies'::text, true),
  ('professional.license_issuing_body'::text, 'rehabilitation'::text, ARRAY[]::text[], 'applies'::text, true),
  ('professional.license_issuing_body'::text, 'mental-health'::text, ARRAY[]::text[], 'applies'::text, true),
  ('professional.license_issuing_body'::text, 'medical-home-care'::text, ARRAY[]::text[], 'applies'::text, true),
  ('professional.license_issuing_body'::text, 'animal-health'::text, ARRAY[]::text[], 'applies'::text, true),
  ('professional.license_issuing_body'::text, 'architecture-interiors'::text, ARRAY[]::text[], 'applies'::text, true),
  ('professional.age_groups'::text, 'dental-care'::text, ARRAY[]::text[], 'applies'::text, false),
  ('professional.age_groups'::text, 'rehabilitation'::text, ARRAY[]::text[], 'applies'::text, false),
  ('professional.age_groups'::text, 'mental-health'::text, ARRAY[]::text[], 'applies'::text, false),
  ('professional.age_groups'::text, 'medical-home-care'::text, ARRAY[]::text[], 'applies'::text, false),
  ('legal.practice_areas'::text, 'legal-services'::text, ARRAY[]::text[], 'recommended'::text, false),
  ('finance.client_types'::text, 'finance-tax'::text, ARRAY[]::text[], 'recommended'::text, false),
  ('finance.tax_regimes'::text, 'finance-tax'::text, ARRAY['insurance-broker','financial-advisor']::text[], 'applies'::text, false),
  ('finance.software_used'::text, 'finance-tax'::text, ARRAY['insurance-broker','financial-advisor']::text[], 'applies'::text, false),
  ('dental.specialties'::text, 'dental-care'::text, ARRAY[]::text[], 'recommended'::text, false),
  ('rehab.conditions_treated'::text, 'rehabilitation'::text, ARRAY[]::text[], 'recommended'::text, false),
  ('mental.approach'::text, 'mental-health'::text, ARRAY[]::text[], 'recommended'::text, false),
  ('medhome.services_at_home'::text, 'medical-home-care'::text, ARRAY[]::text[], 'recommended'::text, false),
  ('medhome.hours_available'::text, 'medical-home-care'::text, ARRAY[]::text[], 'applies'::text, false),
  ('arch.project_types'::text, 'architecture-interiors'::text, ARRAY[]::text[], 'recommended'::text, false),
  ('svc.online_or_in_person'::text, 'legal-services'::text, ARRAY[]::text[], 'recommended'::text, false),
  ('svc.online_or_in_person'::text, 'finance-tax'::text, ARRAY[]::text[], 'recommended'::text, false),
  ('svc.online_or_in_person'::text, 'rehabilitation'::text, ARRAY[]::text[], 'recommended'::text, false),
  ('svc.online_or_in_person'::text, 'mental-health'::text, ARRAY[]::text[], 'recommended'::text, false),
  ('svc.online_or_in_person'::text, 'architecture-interiors'::text, ARRAY[]::text[], 'recommended'::text, false),
  ('svc.home_visits'::text, 'dental-care'::text, ARRAY[]::text[], 'recommended'::text, false),
  ('svc.home_visits'::text, 'rehabilitation'::text, ARRAY[]::text[], 'recommended'::text, false),
  ('svc.home_visits'::text, 'animal-health'::text, ARRAY[]::text[], 'recommended'::text, false),
  ('pets.species'::text, 'animal-health'::text, ARRAY[]::text[], 'recommended'::text, false)
) AS r(field_key, group_slug, exclude_types, relationship, needs_verification)
JOIN public.profile_field_definitions fd
  ON fd.field_key = r.field_key AND fd.deprecated_at IS NULL
JOIN public.taxonomy_terms grp
  ON grp.slug = r.group_slug AND grp.term_type = 'category_group'
JOIN public.taxonomy_terms tt
  ON tt.parent_id = grp.id
 AND tt.term_type = 'talent_type'
 AND NOT (tt.slug = ANY (r.exclude_types))
ON CONFLICT (field_definition_id, taxonomy_term_id, relationship) DO NOTHING;

-- 4. Post-assertions (abort + roll back rather than ship a wrong privacy state).
DO $post$
DECLARE
  bad INT;
  lic INT;
BEGIN
  SELECT count(*) INTO bad
    FROM public.profile_field_definitions
   WHERE field_key IN ('professional.license_number', 'professional.license_issuing_body')
     AND (is_sensitive IS DISTINCT FROM true
          OR show_in_public IS DISTINCT FROM false
          OR show_in_directory IS DISTINCT FROM false
          OR show_in_directory_filter IS DISTINCT FROM false
          OR show_in_directory_card IS DISTINCT FROM false
          OR show_in_public_profile_sidebar IS DISTINCT FROM false
          OR 'public' = ANY (default_visibility)
          OR requires_review_on_change IS DISTINCT FROM true);
  IF bad <> 0 THEN
    RAISE EXCEPTION 'taxonomy_expansion_regulated_fields: licence fields not private (% rows)', bad;
  END IF;

  SELECT count(*) INTO lic
    FROM public.profile_field_recommendations pr
    JOIN public.profile_field_definitions fd ON fd.id = pr.field_definition_id
   WHERE fd.field_key IN ('professional.license_number', 'professional.license_issuing_body')
     AND (pr.requires_verification IS DISTINCT FROM true
          OR pr.required_before_verification IS DISTINCT FROM true
          OR pr.required_at_registration IS DISTINCT FROM false
          OR pr.required_before_publish IS DISTINCT FROM false);
  IF lic <> 0 THEN
    RAISE EXCEPTION 'taxonomy_expansion_regulated_fields: % licence recommendation rows have wrong verification flags', lic;
  END IF;
END
$post$;

COMMIT;
