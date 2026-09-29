-- Taxonomy expansion, phase 1: new categories (6 parents, 30 groups, 119 types).
--
-- Source of truth: ~/Desktop/tulala-exports/demo-foundation/taxonomy-proposal.py
-- Row shape copied from production (read-only sample, 2026-09-29) and from the
-- v2 seeds (20260801120400 / 120410 / 120420) and 20261230001700, which is the
-- most recent seed and already uses the current `name_i18n` column:
--
--   level 1  parent_category  kind='tag'          parent_id NULL
--   level 2  category_group   kind='tag'          parent_id -> parent_category
--   level 3  talent_type      kind='talent_type'  parent_id -> category_group
--
-- ADDITIVE ONLY. Every insert is ON CONFLICT DO NOTHING, no existing row is
-- updated, and nothing is deleted. Re-running is a no-op. Parents are resolved
-- by (term_type, slug), never by a hard-coded uuid; new ids come from the same
-- deterministic public.taxv1_uuid() every v2 seed uses, so production ids stay
-- reproducible on a rebuilt database.
--
-- WHAT IS ADDED
--   6 new parent_categories, sorted AFTER the 19 current ones (sort_order 200..250).
--   25 new category_groups under the new parents, plus 5 new groups under existing
--     parents (production-sound, event-planning, tech-repair, home-extras,
--     vehicle-care), sorted after each parent's existing groups.
--   119 new talent_types. 8 of them go under 3 EXISTING groups that are NOT
--     re-created here and NOT modified: beauty-services (5), adventure-sports (2),
--     concierge-services (1); resolved by slug. Their sort_order continues after
--     the group's current last leaf.
--   After: 25 parents / 105 groups / 557 talent types (active, non-archived).
--
-- FLAG CHOICES (each follows what production already does)
--   is_active TRUE, is_profile_badge TRUE, is_generic_fallback FALSE,
--   is_restricted FALSE for every new row. The regulated groups (legal-services, finance-tax, dental-care, rehabilitation, mental-health, medical-home-care, architecture-interiors, animal-health)
--   are NOT marked is_restricted: that flag hides a term from the core
--   marketplace ("restricted hubs") and its restriction_level values (age_18,
--   age_21, ...) do not describe professional licensing. Their licence / cedula
--   fields are made private in the fields migration (phase 2), not here.
--   is_public_filter FALSE everywhere: it is true only for the 8 core marketplace
--   parents and drives the storefront top bar, which must not change for
--   existing tenants. The directory category bar is built from tagged talent, so
--   new categories appear there as soon as a talent is tagged.
--   is_visible_by_default FALSE on the 6 new parents, TRUE on groups and types:
--   the same as the 11 non-core parents (hidden behind "Show all categories"
--   until a talent is tagged there).
--
-- I18N / SEARCH
--   name_i18n = {en, es}. plural_name is an English plural (parents and groups
--   repeat the name, as the admin form does). aliases holds the Spanish display
--   name when it differs from English. search_synonyms holds lowercase Spanish
--   and English alternates, each also without accents: the picker search is an
--   exact array-contains match, and only the onboarding type-chip matcher folds
--   accents and case itself.
--
-- TENANT SETTINGS (last section)
--   Readers treat a missing agency_taxonomy_settings row as ENABLED, so every
--   tenant that has all terms enabled (17 of 18) shows the new terms at once.
--   The one curated tenant, Impronta (10 of 19 parents, 175 leaves enabled by
--   20261003000000), gets explicit DISABLED rows for every new term so its
--   launch set does not change. Its admin can enable any of them in Settings.
--
-- NOT NEEDED HERE
--   talent_discover_index (materialized view) reads talent_profile_taxonomy
--   assignments; a term with no talent assigned does not change it.
--   profile_field_recommendations (trade fields) are the phase 2 migration
--   20261231298200.
--
-- DOWN (manual, only while no talent is tagged with the new types):
--   DELETE FROM public.agency_taxonomy_settings WHERE taxonomy_term_id IN (
--     SELECT id FROM public.taxonomy_terms WHERE created_at >= '2026-09-29'
--       AND term_type IN ('parent_category','category_group','talent_type')
--       AND slug IN (<slugs below>));
--   then delete the same terms, leaf first.

BEGIN;

-- Same definition as every v2 seed; repeated so this file stands alone.
CREATE OR REPLACE FUNCTION public.taxv1_uuid(p_term_type TEXT, p_slug TEXT)
RETURNS UUID LANGUAGE SQL IMMUTABLE AS $$
  SELECT (
    substr(md5('tulala/taxonomy/v1/' || p_term_type || '/' || p_slug), 1, 8) || '-' ||
    substr(md5('tulala/taxonomy/v1/' || p_term_type || '/' || p_slug), 9, 4) || '-' ||
    substr(md5('tulala/taxonomy/v1/' || p_term_type || '/' || p_slug), 13, 4) || '-' ||
    substr(md5('tulala/taxonomy/v1/' || p_term_type || '/' || p_slug), 17, 4) || '-' ||
    substr(md5('tulala/taxonomy/v1/' || p_term_type || '/' || p_slug), 21, 12)
  )::UUID;
$$;

-- Staging table: one row per new term, in parent -> group -> type order.
-- parent_slug is the enclosing parent_category (for a group) or category_group
-- (for a type); NULL for a parent.
CREATE TEMP TABLE _tax298100_stage (
  level            INTEGER NOT NULL,
  term_type        TEXT    NOT NULL,
  slug             TEXT    NOT NULL,
  parent_slug      TEXT,
  name_en          TEXT    NOT NULL,
  name_es          TEXT    NOT NULL,
  plural_name      TEXT    NOT NULL,
  description      TEXT,
  sort_order       INTEGER NOT NULL,
  aliases          TEXT[]  NOT NULL,
  search_synonyms  TEXT[]  NOT NULL
) ON COMMIT DROP;

INSERT INTO _tax298100_stage
  (level, term_type, slug, parent_slug, name_en, name_es, plural_name, description, sort_order, aliases, search_synonyms)
VALUES
    (1, 'parent_category', 'professional-services', NULL, 'Professional Services', 'Servicios Profesionales', 'Professional Services', 'Lawyers, accountants, translators and other licensed or expert services.', 200, ARRAY[]::text[], ARRAY['servicios profesionales']::text[]),
    (1, 'parent_category', 'health-therapy', NULL, 'Health & Therapy', 'Salud y Terapia', 'Health & Therapy', 'Dentists, therapists, nurses and other health and care professionals.', 210, ARRAY[]::text[], ARRAY['salud y terapia']::text[]),
    (1, 'parent_category', 'education-tutoring', NULL, 'Education & Tutoring', 'Educación y Clases', 'Education & Tutoring', 'Tutors, music teachers and instructors for lessons of every kind.', 220, ARRAY[]::text[], ARRAY['educación y clases', 'educacion y clases']::text[]),
    (1, 'parent_category', 'design-digital', NULL, 'Design & Digital', 'Diseño y Digital', 'Design & Digital', 'Designers, developers and architects for brands, products and spaces.', 230, ARRAY[]::text[], ARRAY['diseño y digital', 'diseno y digital']::text[]),
    (1, 'parent_category', 'crafts-makers', NULL, 'Crafts & Makers', 'Artesanos y Oficios', 'Crafts & Makers', 'Jewelers, ceramists, seamstresses and other makers and repair trades.', 240, ARRAY[]::text[], ARRAY['artesanos y oficios']::text[]),
    (1, 'parent_category', 'pets-animal-care', NULL, 'Pets & Animal Care', 'Mascotas', 'Pets & Animal Care', 'Dog walkers, pet sitters, groomers, trainers and animal health.', 250, ARRAY[]::text[], ARRAY['mascotas']::text[]),
    (2, 'category_group', 'legal-services', 'professional-services', 'Legal', 'Legal', 'Legal', NULL, 10, ARRAY[]::text[], ARRAY[]::text[]),
    (3, 'talent_type', 'immigration-lawyer', 'legal-services', 'Immigration lawyer', 'Abogado de migración', 'Immigration lawyers', NULL, 10, ARRAY['Abogado de migración']::text[], ARRAY['abogado de migración', 'abogado de migracion', 'abogado', 'abogado de inmigración', 'abogado de inmigracion', 'lawyer', 'visa lawyer', 'immigration attorney', 'attorney']::text[]),
    (3, 'talent_type', 'family-lawyer', 'legal-services', 'Family lawyer', 'Abogado familiar', 'Family lawyers', NULL, 20, ARRAY['Abogado familiar']::text[], ARRAY['abogado familiar', 'abogado', 'abogado de familia', 'abogado de divorcios', 'divorce lawyer', 'family attorney', 'custody lawyer']::text[]),
    (3, 'talent_type', 'contract-lawyer', 'legal-services', 'Contract & business lawyer', 'Abogado de contratos y empresas', 'Contract & business lawyers', NULL, 30, ARRAY['Abogado de contratos y empresas']::text[], ARRAY['abogado de contratos y empresas', 'abogado', 'abogado corporativo', 'abogado mercantil', 'business lawyer', 'corporate lawyer', 'business attorney']::text[]),
    (3, 'talent_type', 'labor-lawyer', 'legal-services', 'Labor lawyer', 'Abogado laboral', 'Labor lawyers', NULL, 40, ARRAY['Abogado laboral']::text[], ARRAY['abogado laboral', 'abogado', 'abogado de trabajo', 'abogado laboralista', 'employment lawyer', 'employment attorney']::text[]),
    (3, 'talent_type', 'real-estate-lawyer', 'legal-services', 'Real estate lawyer', 'Abogado inmobiliario', 'Real estate lawyers', NULL, 50, ARRAY['Abogado inmobiliario']::text[], ARRAY['abogado inmobiliario', 'abogado', 'abogado de bienes raíces', 'abogado de bienes raices', 'abogado de propiedades', 'property lawyer', 'property attorney']::text[]),
    (3, 'talent_type', 'criminal-lawyer', 'legal-services', 'Criminal lawyer', 'Abogado penal', 'Criminal lawyers', NULL, 60, ARRAY['Abogado penal']::text[], ARRAY['abogado penal', 'abogado', 'abogado criminalista', 'abogado defensor', 'defense lawyer', 'criminal defense attorney']::text[]),
    (2, 'category_group', 'finance-tax', 'professional-services', 'Finance & Tax', 'Finanzas e Impuestos', 'Finance & Tax', NULL, 20, ARRAY[]::text[], ARRAY['finanzas e impuestos']::text[]),
    (3, 'talent_type', 'accountant', 'finance-tax', 'Accountant', 'Contador', 'Accountants', NULL, 10, ARRAY['Contador']::text[], ARRAY['contador', 'contador público', 'contador publico', 'contadora', 'contable', 'cpa', 'certified public accountant']::text[]),
    (3, 'talent_type', 'tax-advisor', 'finance-tax', 'Tax advisor', 'Asesor fiscal', 'Tax advisors', NULL, 20, ARRAY['Asesor fiscal']::text[], ARRAY['asesor fiscal', 'asesor de impuestos', 'consultor fiscal', 'declaración de impuestos', 'declaracion de impuestos', 'tax consultant', 'tax preparer']::text[]),
    (3, 'talent_type', 'bookkeeper', 'finance-tax', 'Bookkeeper', 'Auxiliar contable', 'Bookkeepers', NULL, 30, ARRAY['Auxiliar contable']::text[], ARRAY['auxiliar contable', 'contador', 'contabilidad', 'auxiliar de contabilidad', 'bookkeeping', 'accounting assistant']::text[]),
    (3, 'talent_type', 'insurance-broker', 'finance-tax', 'Insurance broker', 'Agente de seguros', 'Insurance brokers', NULL, 40, ARRAY['Agente de seguros']::text[], ARRAY['agente de seguros', 'corredor de seguros', 'seguros', 'insurance agent']::text[]),
    (3, 'talent_type', 'payroll-specialist', 'finance-tax', 'Payroll specialist', 'Especialista en nómina', 'Payroll specialists', NULL, 50, ARRAY['Especialista en nómina']::text[], ARRAY['especialista en nómina', 'especialista en nomina', 'nómina', 'nomina', 'administrador de nómina', 'administrador de nomina', 'payroll', 'payroll administrator']::text[]),
    (3, 'talent_type', 'financial-advisor', 'finance-tax', 'Financial advisor', 'Asesor financiero', 'Financial advisors', NULL, 60, ARRAY['Asesor financiero']::text[], ARRAY['asesor financiero', 'asesor de inversiones', 'planificador financiero', 'finanzas personales', 'financial planner', 'investment advisor']::text[]),
    (2, 'category_group', 'real-estate-services', 'professional-services', 'Real Estate', 'Bienes Raíces', 'Real Estate', NULL, 30, ARRAY[]::text[], ARRAY['bienes raíces', 'bienes raices']::text[]),
    (3, 'talent_type', 'real-estate-agent', 'real-estate-services', 'Real estate agent', 'Asesor inmobiliario', 'Real estate agents', NULL, 10, ARRAY['Asesor inmobiliario']::text[], ARRAY['asesor inmobiliario', 'agente inmobiliario', 'agente de bienes raíces', 'agente de bienes raices', 'corredor de bienes raíces', 'corredor de bienes raices', 'realtor', 'real estate broker']::text[]),
    (3, 'talent_type', 'property-appraiser', 'real-estate-services', 'Property appraiser', 'Valuador de inmuebles', 'Property appraisers', NULL, 20, ARRAY['Valuador de inmuebles']::text[], ARRAY['valuador de inmuebles', 'valuador', 'perito valuador', 'avalúo', 'avaluo', 'appraiser', 'real estate appraiser']::text[]),
    (3, 'talent_type', 'property-manager', 'real-estate-services', 'Property manager', 'Administrador de propiedades', 'Property managers', NULL, 30, ARRAY['Administrador de propiedades']::text[], ARRAY['administrador de propiedades', 'administrador de inmuebles', 'gestión de propiedades', 'gestion de propiedades', 'rental manager', 'property administration']::text[]),
    (2, 'category_group', 'paperwork-permits', 'professional-services', 'Paperwork & Permits', 'Trámites y Permisos', 'Paperwork & Permits', NULL, 40, ARRAY[]::text[], ARRAY['trámites y permisos', 'tramites y permisos']::text[]),
    (3, 'talent_type', 'paperwork-agent', 'paperwork-permits', 'Paperwork agent (gestor)', 'Gestor de trámites', 'Paperwork agents (gestores)', NULL, 10, ARRAY['Gestor de trámites']::text[], ARRAY['gestor de trámites', 'gestor de tramites', 'gestor', 'tramitador', 'gestoría', 'gestoria', 'trámites', 'tramites', 'errand runner', 'fixer']::text[]),
    (3, 'talent_type', 'customs-broker', 'paperwork-permits', 'Customs broker', 'Agente aduanal', 'Customs brokers', NULL, 20, ARRAY['Agente aduanal']::text[], ARRAY['agente aduanal', 'aduana', 'importación', 'importacion', 'customs agent', 'import export']::text[]),
    (2, 'category_group', 'language-writing', 'professional-services', 'Language & Writing', 'Idiomas y Redacción', 'Language & Writing', NULL, 50, ARRAY[]::text[], ARRAY['idiomas y redacción', 'idiomas y redaccion']::text[]),
    (3, 'talent_type', 'translator', 'language-writing', 'Translator', 'Traductor', 'Translators', NULL, 10, ARRAY['Traductor']::text[], ARRAY['traductor', 'traductora', 'traducción', 'traduccion', 'traductor certificado', 'perito traductor', 'translation']::text[]),
    (3, 'talent_type', 'interpreter', 'language-writing', 'Interpreter', 'Intérprete', 'Interpreters', NULL, 20, ARRAY['Intérprete']::text[], ARRAY['intérprete', 'interprete', 'intérprete de conferencias', 'interprete de conferencias', 'intérprete simultáneo', 'interprete simultaneo', 'interpretación', 'interpretacion', 'interpreting', 'simultaneous interpreter']::text[]),
    (3, 'talent_type', 'copywriter', 'language-writing', 'Copywriter', 'Redactor publicitario', 'Copywriters', NULL, 30, ARRAY['Redactor publicitario']::text[], ARRAY['redactor publicitario', 'redactor', 'redacción publicitaria', 'redaccion publicitaria', 'publicidad', 'ad copywriter', 'advertising writer']::text[]),
    (3, 'talent_type', 'proofreader', 'language-writing', 'Proofreader', 'Corrector de estilo', 'Proofreaders', NULL, 40, ARRAY['Corrector de estilo']::text[], ARRAY['corrector de estilo', 'corrector', 'corrector de textos', 'revisión de textos', 'revision de textos', 'editor', 'editing']::text[]),
    (3, 'talent_type', 'transcriptionist', 'language-writing', 'Transcriptionist', 'Transcriptor', 'Transcriptionists', NULL, 50, ARRAY['Transcriptor']::text[], ARRAY['transcriptor', 'transcripción', 'transcripcion', 'transcriptora', 'transcriber', 'audio transcription']::text[]),
    (3, 'talent_type', 'content-writer', 'language-writing', 'Content writer', 'Redactor de contenido', 'Content writers', NULL, 60, ARRAY['Redactor de contenido']::text[], ARRAY['redactor de contenido', 'redactor', 'redactor web', 'redacción de contenidos', 'redaccion de contenidos', 'blog writer', 'web writer']::text[]),
    (2, 'category_group', 'business-support', 'professional-services', 'Business Support', 'Apoyo a Negocios', 'Business Support', NULL, 60, ARRAY[]::text[], ARRAY['apoyo a negocios']::text[]),
    (3, 'talent_type', 'virtual-assistant', 'business-support', 'Virtual assistant', 'Asistente virtual', 'Virtual assistants', NULL, 10, ARRAY['Asistente virtual']::text[], ARRAY['asistente virtual', 'asistente remoto', 'asistente administrativo', 'remote assistant', 'admin assistant', 'va']::text[]),
    (3, 'talent_type', 'project-manager', 'business-support', 'Project manager', 'Gestor de proyectos', 'Project managers', NULL, 20, ARRAY['Gestor de proyectos']::text[], ARRAY['gestor de proyectos', 'gerente de proyectos', 'coordinador de proyectos', 'project management', 'pm']::text[]),
    (3, 'talent_type', 'automation-consultant', 'business-support', 'Automation consultant', 'Consultor de automatización', 'Automation consultants', NULL, 30, ARRAY['Consultor de automatización']::text[], ARRAY['consultor de automatización', 'consultor de automatizacion', 'automatización', 'automatizacion', 'consultor de procesos', 'automation', 'process automation', 'workflow automation']::text[]),
    (3, 'talent_type', 'social-media-manager', 'business-support', 'Social media manager', 'Community manager', 'Social media managers', NULL, 40, ARRAY['Community manager']::text[], ARRAY['community manager', 'manejo de redes sociales', 'redes sociales', 'social media', 'social media consultant', 'smm']::text[]),
    (3, 'talent_type', 'marketing-consultant', 'business-support', 'Marketing consultant', 'Consultor de marketing', 'Marketing consultants', NULL, 50, ARRAY['Consultor de marketing']::text[], ARRAY['consultor de marketing', 'asesor de marketing', 'marketing digital', 'consultor de mercadotecnia', 'digital marketing', 'marketing strategist']::text[]),
    (3, 'talent_type', 'recruiter', 'business-support', 'Recruiter', 'Reclutador', 'Recruiters', NULL, 60, ARRAY['Reclutador']::text[], ARRAY['reclutador', 'reclutadora', 'selección de personal', 'seleccion de personal', 'recursos humanos', 'headhunter', 'talent acquisition']::text[]),
    (2, 'category_group', 'dental-care', 'health-therapy', 'Dental', 'Dental', 'Dental', NULL, 10, ARRAY[]::text[], ARRAY[]::text[]),
    (3, 'talent_type', 'dentist', 'dental-care', 'Dentist', 'Dentista', 'Dentists', NULL, 10, ARRAY['Dentista']::text[], ARRAY['dentista', 'odontólogo', 'odontologo', 'cirujano dentista', 'odontología', 'odontologia', 'dental']::text[]),
    (3, 'talent_type', 'dental-hygienist', 'dental-care', 'Dental hygienist', 'Higienista dental', 'Dental hygienists', NULL, 20, ARRAY['Higienista dental']::text[], ARRAY['higienista dental', 'higienista', 'limpieza dental', 'hygienist', 'dental cleaning']::text[]),
    (3, 'talent_type', 'orthodontist', 'dental-care', 'Orthodontist', 'Ortodoncista', 'Orthodontists', NULL, 30, ARRAY['Ortodoncista']::text[], ARRAY['ortodoncista', 'ortodoncia', 'brackets', 'braces', 'orthodontics']::text[]),
    (2, 'category_group', 'rehabilitation', 'health-therapy', 'Rehabilitation', 'Rehabilitación', 'Rehabilitation', NULL, 20, ARRAY[]::text[], ARRAY['rehabilitación', 'rehabilitacion']::text[]),
    (3, 'talent_type', 'physiotherapist', 'rehabilitation', 'Physiotherapist', 'Fisioterapeuta', 'Physiotherapists', NULL, 10, ARRAY['Fisioterapeuta']::text[], ARRAY['fisioterapeuta', 'fisioterapia', 'terapeuta físico', 'terapeuta fisico', 'terapia física', 'terapia fisica', 'physical therapist', 'physio']::text[]),
    (3, 'talent_type', 'speech-therapist', 'rehabilitation', 'Speech therapist', 'Terapeuta de lenguaje', 'Speech therapists', NULL, 20, ARRAY['Terapeuta de lenguaje']::text[], ARRAY['terapeuta de lenguaje', 'terapia de lenguaje', 'logopeda', 'fonoaudiólogo', 'fonoaudiologo', 'speech pathologist', 'speech language pathologist']::text[]),
    (3, 'talent_type', 'occupational-therapist', 'rehabilitation', 'Occupational therapist', 'Terapeuta ocupacional', 'Occupational therapists', NULL, 30, ARRAY['Terapeuta ocupacional']::text[], ARRAY['terapeuta ocupacional', 'terapia ocupacional', 'ergoterapeuta', 'occupational therapy']::text[]),
    (3, 'talent_type', 'chiropractor', 'rehabilitation', 'Chiropractor', 'Quiropráctico', 'Chiropractors', NULL, 40, ARRAY['Quiropráctico']::text[], ARRAY['quiropráctico', 'quiropractico', 'quiropráctica', 'quiropractica', 'chiropractic']::text[]),
    (3, 'talent_type', 'podiatrist', 'rehabilitation', 'Podiatrist', 'Podólogo', 'Podiatrists', NULL, 50, ARRAY['Podólogo']::text[], ARRAY['podólogo', 'podologo', 'podología', 'podologia', 'quiropodista', 'cuidado de pies', 'foot doctor', 'foot care']::text[]),
    (2, 'category_group', 'mental-health', 'health-therapy', 'Mental Health', 'Salud Mental', 'Mental Health', NULL, 30, ARRAY[]::text[], ARRAY['salud mental']::text[]),
    (3, 'talent_type', 'psychologist', 'mental-health', 'Psychologist', 'Psicólogo', 'Psychologists', NULL, 10, ARRAY['Psicólogo']::text[], ARRAY['psicólogo', 'psicologo', 'psicóloga', 'psicologa', 'psicoterapeuta', 'terapeuta', 'psicología', 'psicologia', 'therapist', 'counselor']::text[]),
    (3, 'talent_type', 'couples-therapist', 'mental-health', 'Couples therapist', 'Terapeuta de pareja', 'Couples therapists', NULL, 20, ARRAY['Terapeuta de pareja']::text[], ARRAY['terapeuta de pareja', 'terapia de pareja', 'terapeuta de parejas', 'consejería de pareja', 'consejeria de pareja', 'marriage counselor', 'couples counseling']::text[]),
    (2, 'category_group', 'medical-home-care', 'health-therapy', 'Medical & Home Care', 'Atención Médica y en Casa', 'Medical & Home Care', NULL, 40, ARRAY[]::text[], ARRAY['atención médica y en casa', 'atencion medica y en casa']::text[]),
    (3, 'talent_type', 'home-doctor', 'medical-home-care', 'Doctor (house calls)', 'Médico a domicilio', 'Doctors (house calls)', NULL, 10, ARRAY['Médico a domicilio']::text[], ARRAY['médico a domicilio', 'medico a domicilio', 'médico', 'medico', 'doctor a domicilio', 'médico general', 'medico general', 'doctor', 'house call doctor']::text[]),
    (3, 'talent_type', 'home-nurse', 'medical-home-care', 'Home nurse', 'Enfermería a domicilio', 'Home nurses', NULL, 20, ARRAY['Enfermera a domicilio']::text[], ARRAY['enfermera a domicilio', 'enfermera', 'enfermero', 'enfermería a domicilio', 'enfermeria a domicilio', 'nurse', 'nursing care']::text[]),
    (3, 'talent_type', 'elder-caregiver', 'medical-home-care', 'Elder caregiver', 'Cuidador de adultos mayores', 'Elder caregivers', NULL, 30, ARRAY['Cuidador de adultos mayores']::text[], ARRAY['cuidador de adultos mayores', 'cuidadora de adultos mayores', 'cuidador de ancianos', 'acompañante de adultos mayores', 'acompanante de adultos mayores', 'caregiver', 'senior caregiver']::text[]),
    (3, 'talent_type', 'nutritionist', 'medical-home-care', 'Nutritionist (licensed)', 'Nutriólogo', 'Nutritionists (licensed)', NULL, 40, ARRAY['Nutriólogo']::text[], ARRAY['nutriólogo', 'nutriologo', 'nutrióloga', 'nutriologa', 'nutricionista', 'nutrición', 'nutricion', 'dietitian', 'dietista']::text[]),
    (3, 'talent_type', 'optometrist', 'medical-home-care', 'Optometrist', 'Optometrista', 'Optometrists', NULL, 50, ARRAY['Optometrista']::text[], ARRAY['optometrista', 'optometría', 'optometria', 'examen de la vista', 'óptico', 'optico', 'eye exam']::text[]),
    (2, 'category_group', 'birth-family-health', 'health-therapy', 'Birth & Postpartum', 'Parto y Posparto', 'Birth & Postpartum', NULL, 50, ARRAY[]::text[], ARRAY['parto y posparto']::text[]),
    (3, 'talent_type', 'doula', 'birth-family-health', 'Doula', 'Doula', 'Doulas', NULL, 10, ARRAY[]::text[], ARRAY['doula de parto', 'acompañante de parto', 'acompanante de parto', 'doula posparto', 'birth doula', 'postpartum doula']::text[]),
    (3, 'talent_type', 'lactation-consultant', 'birth-family-health', 'Lactation consultant', 'Asesoría de lactancia', 'Lactation consultants', NULL, 20, ARRAY['Asesora de lactancia']::text[], ARRAY['asesora de lactancia', 'consultora de lactancia', 'lactancia materna', 'breastfeeding consultant', 'breastfeeding support']::text[]),
    (2, 'category_group', 'academic-tutors', 'education-tutoring', 'Academic Tutors', 'Tutores Académicos', 'Academic Tutors', NULL, 10, ARRAY[]::text[], ARRAY['tutores académicos', 'tutores academicos']::text[]),
    (3, 'talent_type', 'math-tutor', 'academic-tutors', 'Math tutor', 'Maestro de matemáticas', 'Math tutors', NULL, 10, ARRAY['Maestro de matemáticas']::text[], ARRAY['maestro de matemáticas', 'maestro de matematicas', 'profesor de matemáticas', 'profesor de matematicas', 'clases de matemáticas', 'clases de matematicas', 'matemáticas', 'matematicas', 'math teacher', 'algebra tutor']::text[]),
    (3, 'talent_type', 'science-tutor', 'academic-tutors', 'Science tutor', 'Maestro de ciencias', 'Science tutors', NULL, 20, ARRAY['Maestro de ciencias']::text[], ARRAY['maestro de ciencias', 'profesor de ciencias', 'clases de ciencias', 'física', 'fisica', 'química', 'quimica', 'biología', 'biologia', 'science teacher', 'chemistry tutor']::text[]),
    (3, 'talent_type', 'exam-prep-tutor', 'academic-tutors', 'Exam prep tutor', 'Preparación de exámenes', 'Exam prep tutors', NULL, 30, ARRAY['Preparación de exámenes']::text[], ARRAY['preparación de exámenes', 'preparacion de examenes', 'preparación de examen', 'preparacion de examen', 'examen de admisión', 'examen de admision', 'test prep', 'sat prep', 'toefl', 'ielts']::text[]),
    (3, 'talent_type', 'school-tutor', 'academic-tutors', 'School tutor (regularización)', 'Regularización escolar', 'School tutors (regularización)', NULL, 40, ARRAY['Regularización escolar']::text[], ARRAY['regularización escolar', 'regularizacion escolar', 'regularización', 'regularizacion', 'apoyo escolar', 'clases particulares', 'tutor escolar', 'homework help']::text[]),
    (3, 'talent_type', 'special-education-tutor', 'academic-tutors', 'Special education tutor', 'Maestro de educación especial', 'Special education tutors', NULL, 50, ARRAY['Maestro de educación especial']::text[], ARRAY['maestro de educación especial', 'maestro de educacion especial', 'educación especial', 'educacion especial', 'maestra sombra', 'tutor sombra', 'apoyo educativo', 'special needs tutor', 'learning support']::text[]),
    (2, 'category_group', 'tech-education', 'education-tutoring', 'Tech Skills', 'Tecnología', 'Tech Skills', NULL, 20, ARRAY[]::text[], ARRAY['tecnología', 'tecnologia']::text[]),
    (3, 'talent_type', 'coding-tutor', 'tech-education', 'Coding tutor', 'Maestro de programación', 'Coding tutors', NULL, 10, ARRAY['Maestro de programación']::text[], ARRAY['maestro de programación', 'maestro de programacion', 'profesor de programación', 'profesor de programacion', 'clases de programación', 'clases de programacion', 'programming teacher', 'coding teacher', 'python tutor']::text[]),
    (3, 'talent_type', 'computer-classes', 'tech-education', 'Computer & digital skills', 'Clases de computación', 'Computer & digital skills', NULL, 20, ARRAY['Clases de computación']::text[], ARRAY['clases de computación', 'clases de computacion', 'computación básica', 'computacion basica', 'alfabetización digital', 'alfabetizacion digital', 'digital skills', 'computer tutor']::text[]),
    (2, 'category_group', 'music-arts-lessons', 'education-tutoring', 'Music & Arts Lessons', 'Clases de Música y Arte', 'Music & Arts Lessons', NULL, 30, ARRAY[]::text[], ARRAY['clases de música y arte', 'clases de musica y arte']::text[]),
    (3, 'talent_type', 'music-teacher', 'music-arts-lessons', 'Music teacher', 'Maestro de música', 'Music teachers', NULL, 10, ARRAY['Maestro de música']::text[], ARRAY['maestro de música', 'maestro de musica', 'profesor de música', 'profesor de musica', 'clases de música', 'clases de musica', 'music lessons', 'music instructor']::text[]),
    (3, 'talent_type', 'guitar-teacher', 'music-arts-lessons', 'Guitar teacher', 'Maestro de guitarra', 'Guitar teachers', NULL, 20, ARRAY['Maestro de guitarra']::text[], ARRAY['maestro de guitarra', 'profesor de guitarra', 'clases de guitarra', 'guitar lessons', 'guitar instructor']::text[]),
    (3, 'talent_type', 'piano-teacher', 'music-arts-lessons', 'Piano teacher', 'Maestro de piano', 'Piano teachers', NULL, 30, ARRAY['Maestro de piano']::text[], ARRAY['maestro de piano', 'profesor de piano', 'clases de piano', 'piano lessons', 'piano instructor']::text[]),
    (3, 'talent_type', 'voice-teacher', 'music-arts-lessons', 'Voice teacher', 'Maestro de canto', 'Voice teachers', NULL, 40, ARRAY['Maestro de canto']::text[], ARRAY['maestro de canto', 'profesor de canto', 'clases de canto', 'vocal coach', 'singing teacher', 'singing lessons', 'voice lessons']::text[]),
    (3, 'talent_type', 'writing-coach', 'music-arts-lessons', 'Writing coach', 'Taller de escritura', 'Writing coaches', NULL, 50, ARRAY['Taller de escritura']::text[], ARRAY['taller de escritura', 'taller literario', 'escritura creativa', 'creative writing', 'writing workshop', 'writing teacher']::text[]),
    (2, 'category_group', 'life-skills', 'education-tutoring', 'Life Skills', 'Habilidades', 'Life Skills', NULL, 40, ARRAY[]::text[], ARRAY['habilidades']::text[]),
    (3, 'talent_type', 'driving-instructor', 'life-skills', 'Driving instructor', 'Instructor de manejo', 'Driving instructors', NULL, 10, ARRAY['Instructor de manejo']::text[], ARRAY['instructor de manejo', 'clases de manejo', 'escuela de manejo', 'instructor de conducción', 'instructor de conduccion', 'driving teacher', 'driving lessons']::text[]),
    (2, 'category_group', 'graphic-illustration', 'design-digital', 'Graphic & Illustration', 'Gráfico e Ilustración', 'Graphic & Illustration', NULL, 10, ARRAY[]::text[], ARRAY['gráfico e ilustración', 'grafico e ilustracion']::text[]),
    (3, 'talent_type', 'graphic-designer', 'graphic-illustration', 'Graphic designer', 'Diseñador gráfico', 'Graphic designers', NULL, 10, ARRAY['Diseñador gráfico']::text[], ARRAY['diseñador gráfico', 'disenador grafico', 'diseñadora gráfica', 'disenadora grafica', 'diseño gráfico', 'diseno grafico', 'diseñador', 'disenador', 'graphic design', 'designer']::text[]),
    (3, 'talent_type', 'illustrator', 'graphic-illustration', 'Illustrator', 'Ilustrador', 'Illustrators', NULL, 20, ARRAY['Ilustrador']::text[], ARRAY['ilustrador', 'ilustradora', 'ilustración', 'ilustracion', 'dibujante', 'illustration', 'digital illustrator']::text[]),
    (3, 'talent_type', 'mural-artist', 'graphic-illustration', 'Mural artist', 'Muralista', 'Mural artists', NULL, 30, ARRAY['Muralista']::text[], ARRAY['muralista', 'muralismo', 'mural', 'pintor de murales', 'muralist', 'wall painter']::text[]),
    (3, 'talent_type', 'brand-designer', 'graphic-illustration', 'Brand & logo designer', 'Diseñador de marca', 'Brand & logo designers', NULL, 40, ARRAY['Diseñador de marca']::text[], ARRAY['diseñador de marca', 'disenador de marca', 'diseñador de logotipos', 'disenador de logotipos', 'logotipos', 'identidad de marca', 'branding', 'logo designer', 'brand identity designer']::text[]),
    (2, 'category_group', 'web-product', 'design-digital', 'Web & Product', 'Web y Producto', 'Web & Product', NULL, 20, ARRAY[]::text[], ARRAY['web y producto']::text[]),
    (3, 'talent_type', 'web-designer', 'web-product', 'Web designer', 'Diseñador web', 'Web designers', NULL, 10, ARRAY['Diseñador web']::text[], ARRAY['diseñador web', 'disenador web', 'diseño web', 'diseno web', 'página web', 'pagina web', 'diseñadora web', 'disenadora web', 'web design', 'website designer']::text[]),
    (3, 'talent_type', 'ux-designer', 'web-product', 'UX/UI designer', 'Diseñador UX/UI', 'UX/UI designers', NULL, 20, ARRAY['Diseñador UX/UI']::text[], ARRAY['diseñador ux/ui', 'disenador ux/ui', 'diseñador ui', 'disenador ui', 'diseñador ux', 'disenador ux', 'diseño de interfaces', 'diseno de interfaces', 'ui designer', 'ux designer', 'product designer']::text[]),
    (3, 'talent_type', 'industrial-designer', 'web-product', 'Industrial designer', 'Diseñador industrial', 'Industrial designers', NULL, 30, ARRAY['Diseñador industrial']::text[], ARRAY['diseñador industrial', 'disenador industrial', 'diseño industrial', 'diseno industrial', 'diseñador de producto', 'disenador de producto', 'industrial design', 'product designer']::text[]),
    (3, 'talent_type', '3d-designer', 'web-product', '3D designer', 'Diseñador 3D', '3D designers', NULL, 40, ARRAY['Diseñador 3D']::text[], ARRAY['diseñador 3d', 'disenador 3d', 'modelado 3d', 'renderista', '3d modeler', '3d artist', '3d modeling']::text[]),
    (2, 'category_group', 'development', 'design-digital', 'Development', 'Desarrollo', 'Development', NULL, 30, ARRAY[]::text[], ARRAY['desarrollo']::text[]),
    (3, 'talent_type', 'software-developer', 'development', 'Software developer', 'Desarrollador', 'Software developers', NULL, 10, ARRAY['Desarrollador']::text[], ARRAY['desarrollador', 'programador', 'ingeniero de software', 'desarrolladora', 'software engineer', 'programmer', 'developer']::text[]),
    (3, 'talent_type', 'app-developer', 'development', 'App developer', 'Desarrollador de apps', 'App developers', NULL, 20, ARRAY['Desarrollador de apps']::text[], ARRAY['desarrollador de apps', 'desarrollador móvil', 'desarrollador movil', 'desarrollador de aplicaciones', 'mobile developer', 'ios developer', 'android developer']::text[]),
    (3, 'talent_type', 'seo-specialist', 'development', 'SEO specialist', 'Especialista SEO', 'SEO specialists', NULL, 30, ARRAY['Especialista SEO']::text[], ARRAY['especialista seo', 'seo', 'posicionamiento web', 'posicionamiento en buscadores', 'search engine optimization', 'seo consultant']::text[]),
    (2, 'category_group', 'architecture-interiors', 'design-digital', 'Architecture & Interiors', 'Arquitectura e Interiores', 'Architecture & Interiors', NULL, 40, ARRAY[]::text[], ARRAY['arquitectura e interiores']::text[]),
    (3, 'talent_type', 'architect', 'architecture-interiors', 'Architect', 'Arquitecto', 'Architects', NULL, 10, ARRAY['Arquitecto']::text[], ARRAY['arquitecto', 'arquitecta', 'arquitectura', 'diseño arquitectónico', 'diseno arquitectonico', 'architecture']::text[]),
    (3, 'talent_type', 'interior-designer', 'architecture-interiors', 'Interior designer', 'Diseñador de interiores', 'Interior designers', NULL, 20, ARRAY['Diseñador de interiores']::text[], ARRAY['diseñador de interiores', 'disenador de interiores', 'diseñadora de interiores', 'disenadora de interiores', 'interiorismo', 'decorador de interiores', 'decoración', 'decoracion', 'interior decorator', 'interior design']::text[]),
    (2, 'category_group', 'jewelry-watches', 'crafts-makers', 'Jewelry & Watches', 'Joyería y Relojería', 'Jewelry & Watches', NULL, 10, ARRAY[]::text[], ARRAY['joyería y relojería', 'joyeria y relojeria']::text[]),
    (3, 'talent_type', 'jewelry-designer', 'jewelry-watches', 'Jewelry designer', 'Diseñador de joyería', 'Jewelry designers', NULL, 10, ARRAY['Diseñador de joyería']::text[], ARRAY['diseñador de joyería', 'disenador de joyeria', 'joyero', 'joyera', 'diseño de joyas', 'diseno de joyas', 'joyería', 'joyeria', 'jeweler', 'jewellery designer']::text[]),
    (3, 'talent_type', 'jewelry-repair', 'jewelry-watches', 'Jewelry repair', 'Reparación de joyería', 'Jewelry repair', NULL, 20, ARRAY['Reparación de joyería']::text[], ARRAY['reparación de joyería', 'reparacion de joyeria', 'reparación de joyas', 'reparacion de joyas', 'arreglo de joyas', 'joyero', 'jeweler', 'jewelry restoration']::text[]),
    (3, 'talent_type', 'silversmith', 'jewelry-watches', 'Silversmith', 'Platero', 'Silversmiths', NULL, 30, ARRAY['Platero']::text[], ARRAY['platero', 'platería', 'plateria', 'plata', 'orfebre de plata', 'silver jewelry']::text[]),
    (3, 'talent_type', 'goldsmith', 'jewelry-watches', 'Goldsmith', 'Orfebre', 'Goldsmiths', NULL, 40, ARRAY['Orfebre']::text[], ARRAY['orfebre', 'orfebrería', 'orfebreria', 'oro', 'joyero de oro', 'gold jewelry']::text[]),
    (3, 'talent_type', 'gemstone-setter', 'jewelry-watches', 'Gemstone setter', 'Engastador', 'Gemstone setters', NULL, 50, ARRAY['Engastador']::text[], ARRAY['engastador', 'engaste', 'engastado', 'gemas', 'stone setter', 'gem setter']::text[]),
    (3, 'talent_type', 'watch-repair', 'jewelry-watches', 'Watch repair', 'Relojero', 'Watch repair', NULL, 60, ARRAY['Relojero']::text[], ARRAY['relojero', 'reparación de relojes', 'reparacion de relojes', 'relojería', 'relojeria', 'relojes', 'watchmaker', 'watch repairer']::text[]),
    (2, 'category_group', 'handcraft', 'crafts-makers', 'Handcraft', 'Hecho a Mano', 'Handcraft', NULL, 20, ARRAY[]::text[], ARRAY['hecho a mano']::text[]),
    (3, 'talent_type', 'ceramist', 'handcraft', 'Ceramist', 'Ceramista', 'Ceramists', NULL, 10, ARRAY['Ceramista']::text[], ARRAY['ceramista', 'cerámica', 'ceramica', 'alfarero', 'alfarera', 'potter', 'pottery', 'ceramics']::text[]),
    (3, 'talent_type', 'leatherworker', 'handcraft', 'Leatherworker', 'Marroquinero', 'Leatherworkers', NULL, 20, ARRAY['Marroquinero']::text[], ARRAY['marroquinero', 'marroquinería', 'marroquineria', 'talabartero', 'artesano de piel', 'peletero', 'leather craftsman', 'leather goods']::text[]),
    (3, 'talent_type', 'embroidery-artist', 'handcraft', 'Embroidery artist', 'Bordado', 'Embroidery artists', NULL, 30, ARRAY['Bordadora']::text[], ARRAY['bordadora', 'bordado', 'bordador', 'bordados a mano', 'embroiderer', 'embroidery']::text[]),
    (3, 'talent_type', 'calligrapher', 'handcraft', 'Calligrapher', 'Calígrafo', 'Calligraphers', NULL, 40, ARRAY['Calígrafo']::text[], ARRAY['calígrafo', 'caligrafo', 'caligrafía', 'caligrafia', 'calígrafa', 'caligrafa', 'lettering', 'hand lettering']::text[]),
    (3, 'talent_type', 'woodworker', 'handcraft', 'Woodworker', 'Artesano de madera', 'Woodworkers', NULL, 50, ARRAY['Artesano de madera']::text[], ARRAY['artesano de madera', 'carpintero artesanal', 'ebanista', 'ebanistería', 'ebanisteria', 'carpintero', 'wood craftsman', 'wood artisan']::text[]),
    (2, 'category_group', 'sewing-repair', 'crafts-makers', 'Sewing & Repair', 'Costura y Reparación', 'Sewing & Repair', NULL, 30, ARRAY[]::text[], ARRAY['costura y reparación', 'costura y reparacion']::text[]),
    (3, 'talent_type', 'seamstress', 'sewing-repair', 'Seamstress & alterations', 'Costura y arreglos', 'Seamstresses & alterations', NULL, 10, ARRAY['Costurera']::text[], ARRAY['costurera', 'costura', 'sastre', 'modista', 'arreglos de ropa', 'alterations', 'tailor', 'dressmaker']::text[]),
    (3, 'talent_type', 'upholsterer', 'sewing-repair', 'Upholsterer', 'Tapicero', 'Upholsterers', NULL, 20, ARRAY['Tapicero']::text[], ARRAY['tapicero', 'tapicería', 'tapiceria', 'tapicero de muebles', 'upholstery', 'furniture upholstery']::text[]),
    (3, 'talent_type', 'shoe-repair', 'sewing-repair', 'Shoe repair', 'Zapatero', 'Shoe repair', NULL, 30, ARRAY['Zapatero']::text[], ARRAY['zapatero', 'reparación de calzado', 'reparacion de calzado', 'zapatería', 'zapateria', 'calzado', 'cobbler', 'shoemaker']::text[]),
    (3, 'talent_type', 'furniture-restorer', 'sewing-repair', 'Furniture restorer', 'Restaurador de muebles', 'Furniture restorers', NULL, 40, ARRAY['Restaurador de muebles']::text[], ARRAY['restaurador de muebles', 'restauración de muebles', 'restauracion de muebles', 'restauración', 'restauracion', 'furniture restoration', 'antique restorer']::text[]),
    (2, 'category_group', 'pet-walking-sitting', 'pets-animal-care', 'Walking & Sitting', 'Paseo y Cuidado', 'Walking & Sitting', NULL, 10, ARRAY[]::text[], ARRAY['paseo y cuidado']::text[]),
    (3, 'talent_type', 'dog-walker', 'pet-walking-sitting', 'Dog walker', 'Paseador de perros', 'Dog walkers', NULL, 10, ARRAY['Paseador de perros']::text[], ARRAY['paseador de perros', 'paseo de perros', 'paseador', 'caminador de perros', 'dog walking']::text[]),
    (3, 'talent_type', 'pet-sitter', 'pet-walking-sitting', 'Pet sitter', 'Cuidador de mascotas', 'Pet sitters', NULL, 20, ARRAY['Cuidador de mascotas']::text[], ARRAY['cuidador de mascotas', 'cuidado de mascotas', 'niñera de mascotas', 'ninera de mascotas', 'mascotas', 'pet care', 'house sitter']::text[]),
    (3, 'talent_type', 'cat-sitter', 'pet-walking-sitting', 'Cat sitter', 'Cuidador de gatos', 'Cat sitters', NULL, 30, ARRAY['Cuidador de gatos']::text[], ARRAY['cuidador de gatos', 'cuidado de gatos', 'gatos', 'visita a gatos', 'cat care']::text[]),
    (3, 'talent_type', 'pet-daycare', 'pet-walking-sitting', 'Pet boarding & daycare', 'Guardería de mascotas', 'Pet boarding & daycare', NULL, 40, ARRAY['Guardería de mascotas']::text[], ARRAY['guardería de mascotas', 'guarderia de mascotas', 'guardería canina', 'guarderia canina', 'hospedaje de mascotas', 'pensión para mascotas', 'pension para mascotas', 'pet hotel', 'pet boarding', 'dog daycare']::text[]),
    (2, 'category_group', 'pet-grooming-training', 'pets-animal-care', 'Grooming & Training', 'Estética y Adiestramiento', 'Grooming & Training', NULL, 20, ARRAY[]::text[], ARRAY['estética y adiestramiento', 'estetica y adiestramiento']::text[]),
    (3, 'talent_type', 'dog-groomer', 'pet-grooming-training', 'Dog groomer', 'Estética canina', 'Dog groomers', NULL, 10, ARRAY['Estética canina']::text[], ARRAY['estética canina', 'estetica canina', 'peluquería canina', 'peluqueria canina', 'baño de perros', 'bano de perros', 'estética de mascotas', 'estetica de mascotas', 'grooming', 'pet groomer', 'dog grooming']::text[]),
    (3, 'talent_type', 'dog-trainer', 'pet-grooming-training', 'Dog trainer', 'Adiestrador canino', 'Dog trainers', NULL, 20, ARRAY['Adiestrador canino']::text[], ARRAY['adiestrador canino', 'entrenador de perros', 'adiestramiento canino', 'adiestrador', 'educador canino', 'dog training']::text[]),
    (2, 'category_group', 'animal-health', 'pets-animal-care', 'Animal Health', 'Salud Animal', 'Animal Health', NULL, 30, ARRAY[]::text[], ARRAY['salud animal']::text[]),
    (3, 'talent_type', 'home-vet', 'animal-health', 'Veterinarian (house calls)', 'Veterinario a domicilio', 'Veterinarians (house calls)', NULL, 10, ARRAY['Veterinario a domicilio']::text[], ARRAY['veterinario a domicilio', 'veterinaria', 'médico veterinario', 'medico veterinario', 'mvz', 'veterinario', 'vet', 'vet house call']::text[]),
    (3, 'talent_type', 'equine-care', 'animal-health', 'Equine care', 'Cuidado equino', 'Equine care', NULL, 20, ARRAY['Cuidado equino']::text[], ARRAY['cuidado equino', 'caballos', 'herrador', 'cuidado de caballos', 'manejo de caballos', 'equine', 'horse care', 'farrier']::text[]),
    (2, 'category_group', 'production-sound', 'music-djs', 'Production & Sound', 'Producción y Sonido', 'Production & Sound', NULL, 50, ARRAY[]::text[], ARRAY['producción y sonido', 'produccion y sonido']::text[]),
    (3, 'talent_type', 'music-producer', 'production-sound', 'Music producer', 'Productor musical', 'Music producers', NULL, 10, ARRAY['Productor musical']::text[], ARRAY['productor musical', 'productora musical', 'producción musical', 'produccion musical', 'beatmaker', 'producer', 'music production']::text[]),
    (3, 'talent_type', 'sound-designer', 'production-sound', 'Sound designer', 'Diseñador sonoro', 'Sound designers', NULL, 20, ARRAY['Diseñador sonoro']::text[], ARRAY['diseñador sonoro', 'disenador sonoro', 'diseño de sonido', 'diseno de sonido', 'diseño sonoro', 'diseno sonoro', 'sound design', 'audio designer', 'foley']::text[]),
    (3, 'talent_type', 'mixing-engineer', 'production-sound', 'Mixing & mastering engineer', 'Ingeniero de mezcla', 'Mixing & mastering engineers', NULL, 30, ARRAY['Ingeniero de mezcla']::text[], ARRAY['ingeniero de mezcla', 'ingeniero de audio', 'mezcla y masterización', 'mezcla y masterizacion', 'mastering', 'audio engineer', 'mix engineer']::text[]),
    (3, 'talent_type', 'barber', 'beauty-services', 'Barber', 'Barbero', 'Barbers', NULL, 110, ARRAY['Barbero']::text[], ARRAY['barbero', 'barbería', 'barberia', 'corte de cabello para hombre', 'peluquero', 'men''s haircut', 'barber shop']::text[]),
    (3, 'talent_type', 'esthetician', 'beauty-services', 'Esthetician / facialist', 'Cosmetología', 'Estheticians / facialists', NULL, 120, ARRAY['Cosmetóloga']::text[], ARRAY['cosmetóloga', 'cosmetologa', 'cosmetólogo', 'cosmetologo', 'facialista', 'faciales', 'estética facial', 'estetica facial', 'facial', 'skincare']::text[]),
    (3, 'talent_type', 'permanent-makeup-artist', 'beauty-services', 'Permanent makeup artist', 'Micropigmentación', 'Permanent makeup artists', NULL, 130, ARRAY['Micropigmentación']::text[], ARRAY['micropigmentación', 'micropigmentacion', 'micropigmentadora', 'microblading', 'maquillaje permanente', 'pmu']::text[]),
    (3, 'talent_type', 'tattoo-artist', 'beauty-services', 'Tattoo artist', 'Tatuador', 'Tattoo artists', NULL, 140, ARRAY['Tatuador']::text[], ARRAY['tatuador', 'tatuadora', 'tatuajes', 'tattoo']::text[]),
    (3, 'talent_type', 'piercer', 'beauty-services', 'Piercer', 'Perforador', 'Piercers', NULL, 150, ARRAY['Perforador']::text[], ARRAY['perforador', 'piercing', 'perforadora', 'perforaciones', 'body piercing']::text[]),
    (2, 'category_group', 'event-planning', 'production-bts', 'Event Planning', 'Planeación de Eventos', 'Event Planning', NULL, 50, ARRAY[]::text[], ARRAY['planeación de eventos', 'planeacion de eventos']::text[]),
    (3, 'talent_type', 'wedding-planner', 'event-planning', 'Wedding planner', 'Wedding planner', 'Wedding planners', NULL, 10, ARRAY[]::text[], ARRAY['organizadora de bodas', 'planeador de bodas', 'coordinador de bodas', 'bodas', 'wedding coordinator']::text[]),
    (3, 'talent_type', 'event-planner', 'event-planning', 'Event planner', 'Organizador de eventos', 'Event planners', NULL, 20, ARRAY['Organizador de eventos']::text[], ARRAY['organizador de eventos', 'planeador de eventos', 'organizadora de eventos', 'coordinador de eventos', 'eventos', 'event coordinator']::text[]),
    (3, 'talent_type', 'kids-party-planner', 'event-planning', 'Kids party planner', 'Organizador de fiestas infantiles', 'Kids party planners', NULL, 30, ARRAY['Organizador de fiestas infantiles']::text[], ARRAY['organizador de fiestas infantiles', 'fiestas infantiles', 'organizadora de fiestas infantiles', 'cumpleaños infantiles', 'cumpleanos infantiles', 'children''s party planner', 'kids birthday']::text[]),
    (3, 'talent_type', 'wedding-officiant', 'event-planning', 'Wedding officiant (symbolic)', 'Oficiante de ceremonias simbólicas', 'Wedding officiants (symbolic)', NULL, 40, ARRAY['Oficiante de ceremonias simbólicas']::text[], ARRAY['oficiante de ceremonias simbólicas', 'oficiante de ceremonias simbolicas', 'oficiante', 'ceremonia simbólica', 'ceremonia simbolica', 'celebrant', 'wedding celebrant', 'ceremony officiant']::text[]),
    (2, 'category_group', 'tech-repair', 'home-technical-services', 'Tech Repair', 'Reparación de Tecnología', 'Tech Repair', NULL, 50, ARRAY[]::text[], ARRAY['reparación de tecnología', 'reparacion de tecnologia']::text[]),
    (3, 'talent_type', 'computer-technician', 'tech-repair', 'Computer technician', 'Técnico en computación', 'Computer technicians', NULL, 10, ARRAY['Técnico en computación']::text[], ARRAY['técnico en computación', 'tecnico en computacion', 'técnico de computadoras', 'tecnico de computadoras', 'técnico de pc', 'tecnico de pc', 'reparación de computadoras', 'reparacion de computadoras', 'pc repair', 'computer repair']::text[]),
    (3, 'talent_type', 'phone-repair', 'tech-repair', 'Phone repair', 'Reparación de celulares', 'Phone repair', NULL, 20, ARRAY['Reparación de celulares']::text[], ARRAY['reparación de celulares', 'reparacion de celulares', 'reparación de celular', 'reparacion de celular', 'reparación de teléfonos', 'reparacion de telefonos', 'pantalla de celular', 'cell phone repair', 'phone fix']::text[]),
    (3, 'talent_type', 'it-support', 'tech-repair', 'IT support', 'Soporte técnico', 'IT support', NULL, 30, ARRAY['Soporte técnico']::text[], ARRAY['soporte técnico', 'soporte tecnico', 'soporte informático', 'soporte informatico', 'soporte de ti', 'técnico de redes', 'tecnico de redes', 'help desk', 'it technician', 'tech support']::text[]),
    (2, 'category_group', 'home-extras', 'home-technical-services', 'More Home Services', 'Más Servicios del Hogar', 'More Home Services', NULL, 60, ARRAY[]::text[], ARRAY['más servicios del hogar', 'mas servicios del hogar']::text[]),
    (3, 'talent_type', 'pest-control', 'home-extras', 'Pest control', 'Control de plagas', 'Pest control', NULL, 10, ARRAY['Control de plagas']::text[], ARRAY['control de plagas', 'fumigación', 'fumigacion', 'fumigador', 'exterminador', 'plagas', 'pest exterminator']::text[]),
    (3, 'talent_type', 'solar-installer', 'home-extras', 'Solar installer', 'Instalador de paneles solares', 'Solar installers', NULL, 20, ARRAY['Instalador de paneles solares']::text[], ARRAY['instalador de paneles solares', 'paneles solares', 'instalación solar', 'instalacion solar', 'energía solar', 'energia solar', 'solar panels', 'solar technician']::text[]),
    (2, 'category_group', 'vehicle-care', 'transportation', 'Vehicle Care', 'Cuidado Vehicular', 'Vehicle Care', NULL, 50, ARRAY[]::text[], ARRAY['cuidado vehicular']::text[]),
    (3, 'talent_type', 'mobile-mechanic', 'vehicle-care', 'Mobile mechanic', 'Mecánico a domicilio', 'Mobile mechanics', NULL, 10, ARRAY['Mecánico a domicilio']::text[], ARRAY['mecánico a domicilio', 'mecanico a domicilio', 'mecánico móvil', 'mecanico movil', 'mecánico automotriz a domicilio', 'mecanico automotriz a domicilio', 'taller móvil', 'taller movil', 'mobile car repair', 'auto mechanic']::text[]),
    (3, 'talent_type', 'auto-detailer', 'vehicle-care', 'Auto detailer', 'Detallado automotriz', 'Auto detailers', NULL, 20, ARRAY['Detallado automotriz']::text[], ARRAY['detallado automotriz', 'detallado de autos', 'pulido de autos', 'detailing', 'car detailing']::text[]),
    (3, 'talent_type', 'car-wash', 'vehicle-care', 'Car wash at home', 'Lavado de autos a domicilio', 'Car wash at home', NULL, 30, ARRAY['Lavado de autos a domicilio']::text[], ARRAY['lavado de autos a domicilio', 'lavado de coches', 'lavado de autos', 'autolavado a domicilio', 'lavacoches', 'car washing']::text[]),
    (3, 'talent_type', 'bicycle-mechanic', 'vehicle-care', 'Bicycle mechanic', 'Mecánico de bicicletas', 'Bicycle mechanics', NULL, 40, ARRAY['Mecánico de bicicletas']::text[], ARRAY['mecánico de bicicletas', 'mecanico de bicicletas', 'mecánico de bicis', 'mecanico de bicis', 'reparación de bicicletas', 'reparacion de bicicletas', 'bicicletas', 'bike mechanic', 'bike repair']::text[]),
    (3, 'talent_type', 'scuba-instructor', 'adventure-sports', 'Scuba diving instructor', 'Instructor de buceo', 'Scuba diving instructors', NULL, 50, ARRAY['Instructor de buceo']::text[], ARRAY['instructor de buceo', 'buceo', 'instructor de scuba', 'instructor de buceo padi', 'padi', 'dive instructor', 'diving instructor']::text[]),
    (3, 'talent_type', 'fishing-guide', 'adventure-sports', 'Fishing guide', 'Guía de pesca', 'Fishing guides', NULL, 60, ARRAY['Guía de pesca']::text[], ARRAY['guía de pesca', 'guia de pesca', 'guía de pesca deportiva', 'guia de pesca deportiva', 'pesca', 'pesca deportiva', 'fishing charter', 'sport fishing']::text[]),
    (3, 'talent_type', 'personal-shopper', 'concierge-services', 'Personal shopper', 'Personal shopper', 'Personal shoppers', NULL, 70, ARRAY[]::text[], ARRAY['compras personalizadas', 'asesor de compras', 'shopper', 'compras para clientes']::text[])
;

-- Level 1: parent_categories.
INSERT INTO public.taxonomy_terms (
  id, kind, term_type, level, slug, name_i18n, plural_name, description,
  sort_order, is_active, is_public_filter, is_profile_badge,
  is_visible_by_default, is_generic_fallback, is_restricted,
  aliases, search_synonyms, parent_id
)
SELECT public.taxv1_uuid(s.term_type, s.slug), 'tag', s.term_type, 1, s.slug,
       jsonb_build_object('en', s.name_en, 'es', s.name_es),
       s.plural_name, s.description, s.sort_order,
       TRUE, FALSE, TRUE, FALSE, FALSE, FALSE,
       s.aliases, s.search_synonyms, NULL
  FROM _tax298100_stage s
 WHERE s.level = 1
 ORDER BY s.sort_order
ON CONFLICT DO NOTHING;

-- Level 2: category_groups, parent resolved by slug. A group whose parent is
-- missing is skipped here and reported by the check at the bottom.
INSERT INTO public.taxonomy_terms (
  id, kind, term_type, level, slug, name_i18n, plural_name, description,
  sort_order, is_active, is_public_filter, is_profile_badge,
  is_visible_by_default, is_generic_fallback, is_restricted,
  aliases, search_synonyms, parent_id
)
SELECT public.taxv1_uuid(s.term_type, s.slug), 'tag', s.term_type, 2, s.slug,
       jsonb_build_object('en', s.name_en, 'es', s.name_es),
       s.plural_name, s.description, s.sort_order,
       TRUE, FALSE, TRUE, TRUE, FALSE, FALSE,
       s.aliases, s.search_synonyms, p.id
  FROM _tax298100_stage s
  JOIN public.taxonomy_terms p
    ON p.term_type = 'parent_category'
   AND p.slug = s.parent_slug
   AND p.archived_at IS NULL
 WHERE s.level = 2
 ORDER BY s.sort_order
ON CONFLICT DO NOTHING;

-- Level 3: talent_types, group resolved by slug (new groups from the statement
-- above and the 3 existing groups alike).
INSERT INTO public.taxonomy_terms (
  id, kind, term_type, level, slug, name_i18n, plural_name, description,
  sort_order, is_active, is_public_filter, is_profile_badge,
  is_visible_by_default, is_generic_fallback, is_restricted,
  aliases, search_synonyms, parent_id
)
SELECT public.taxv1_uuid(s.term_type, s.slug), 'talent_type', s.term_type, 3, s.slug,
       jsonb_build_object('en', s.name_en, 'es', s.name_es),
       s.plural_name, s.description, s.sort_order,
       TRUE, FALSE, TRUE, TRUE, FALSE, FALSE,
       s.aliases, s.search_synonyms, p.id
  FROM _tax298100_stage s
  JOIN public.taxonomy_terms p
    ON p.term_type = 'category_group'
   AND p.slug = s.parent_slug
   AND p.archived_at IS NULL
 WHERE s.level = 3
 ORDER BY s.sort_order
ON CONFLICT DO NOTHING;

-- Fail the whole migration (rolls back) unless every staged term now exists
-- once, active, at the right level, under the right parent. This also catches a
-- slug that already existed under a different parent or kind, because DO
-- NOTHING would have skipped it silently.
DO $$
DECLARE
  v_bad TEXT;
BEGIN
  SELECT string_agg(s.term_type || '/' || s.slug, ', ' ORDER BY s.level, s.slug)
    INTO v_bad
    FROM _tax298100_stage s
   WHERE NOT EXISTS (
     SELECT 1
       FROM public.taxonomy_terms t
       LEFT JOIN public.taxonomy_terms p ON p.id = t.parent_id
      WHERE t.term_type = s.term_type
        AND t.slug = s.slug
        AND t.level = s.level
        AND t.is_active
        AND t.archived_at IS NULL
        AND (
          (s.parent_slug IS NULL AND t.parent_id IS NULL)
          OR (p.slug = s.parent_slug
              AND p.term_type = CASE s.level WHEN 2 THEN 'parent_category' ELSE 'category_group' END)
        )
   );

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION
      'taxonomy_expansion_categories: staged terms missing or mis-parented after insert: %', v_bad;
  END IF;
END $$;

-- Tenant settings: keep Impronta's curated launch set unchanged. Explicit
-- disabled rows for every new term (same row shape as 20261003000000).
-- No other tenant is written: a missing row already means "enabled".
INSERT INTO public.agency_taxonomy_settings (
  tenant_id, taxonomy_term_id, is_enabled, show_in_registration,
  show_in_directory, allow_as_primary, allow_as_secondary, requires_approval,
  display_order, updated_at
)
SELECT a.id, t.id, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, t.sort_order, now()
  FROM public.agencies a
 CROSS JOIN _tax298100_stage s
  JOIN public.taxonomy_terms t
    ON t.term_type = s.term_type
   AND t.slug = s.slug
   AND t.archived_at IS NULL
 WHERE a.slug = 'impronta'
ON CONFLICT (tenant_id, taxonomy_term_id) DO NOTHING;

COMMIT;
