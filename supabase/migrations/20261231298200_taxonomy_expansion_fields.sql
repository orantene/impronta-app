-- ============================================================================
-- 20261231298200_taxonomy_expansion_fields.sql
--
-- Taxonomy expansion, Phase 2A: trade fields for the NON-REGULATED new groups
-- (source: ~/Desktop/tulala-exports/demo-foundation/taxonomy-proposal.py,
-- groups WITHOUT regulated: True and with field_rules; branch
-- feat/taxonomy-expansion). Regulated groups live in 20261231298300.
--
-- MUST run AFTER 20261231298100 (creates the talent_type terms this file
-- attaches rules to). Terms are resolved BY SLUG (term_type = 'talent_type');
-- the verification block at the bottom RAISES if a slug is missing, so the
-- migration rolls back loudly instead of applying an empty recommendation set.
--
-- WHAT
--   1. 53 NEW type-specific field definitions (tier/section 'type-specific',
--      field_values storage, catalog render), EN + ES labels/helpers/options,
--      public by default (default_visibility {public,agency}, show_in_public),
--      except realestate.ampi_license (private: sensitive, agency-only).
--      Fields the engine already has are REUSED, not duplicated: languages,
--      industries, event_types, media.website_url/portfolio (universal/global
--      tiers, on every profile), the structured talent_service_areas store
--      (zones / areas covered), tech.callout_radius_km, tech.service_categories
--      and music.genres (already recommended on the parent category).
--   2. 236 field x talent_type recommendations, relationship 'recommended',
--      never required (resolver matches any term in the type -> group -> parent
--      chain, so per-type rows are honoured). Per-type display_order follows the
--      field order inside its group.
--   3. 43 parent_category_field_groups rows for the 6 NEW parent categories
--      (professional-services, health-therapy, education-tutoring, design-digital,
--      crafts-makers, pets-animal-care), same shape as the 19 existing parents, so
--      their fields land in named editor panels. Two groups are deliberately left
--      unmapped: context-best-fit (mapped for none of the 19 parents; mapping it to
--      only the new ones would make the directory facet gate hide fit_labels and
--      tags for every other tenant) and certifications-documents (the specialty
--      editor hides fields of groups that own a dedicated rail section, and 2B's
--      licence numbers live in that group). health-therapy also omits availability
--      for the same reason (2B medhome.hours_available). Every 2A field therefore
--      sits in context-best-fit, equipment-tools or operational-requirements, none
--      of which the editor suppresses.
--   4. Verification (raises on any gap).
--
-- No directory-filter flags: the directory facet catalog is a frozen code
-- registry (directory-field-catalog-registry.ts); a DB flag alone cannot add a
-- facet, and no other trade field sets one either.
--
-- Idempotent: ON CONFLICT (field_key) DO NOTHING on definitions,
-- ON CONFLICT (field_definition_id, taxonomy_term_id, relationship) DO NOTHING
-- on recommendations. Purely additive; touches no existing row.
-- ============================================================================

BEGIN;

-- ── 2A non-regulated ──────────────────────────────────────────────────────

-- 1. Field definitions --------------------------------------------------------
CREATE TEMP TABLE _tx2a_fields (
  field_key text PRIMARY KEY, group_slug text NOT NULL, kind text NOT NULL,
  options jsonb, is_sensitive boolean NOT NULL, default_visibility text[] NOT NULL,
  show_in_public boolean NOT NULL, display_order int NOT NULL,
  validation_rules jsonb, unit text,
  label_i18n jsonb NOT NULL, helper_i18n jsonb NOT NULL,
  placeholder_i18n jsonb NOT NULL, option_labels_i18n jsonb NOT NULL
);

INSERT INTO _tx2a_fields VALUES
  ('realestate.property_types', 'context-best-fit', 'multiselect', '["Houses","Apartments and condos","Land and lots","Beachfront and vacation homes","New developments","Commercial spaces","Offices","Warehouses and industrial","Ranches and rural land"]'::jsonb, false, ARRAY['public','agency']::text[], true, 10, NULL::jsonb, NULL::text,
   '{"en":"Property types","es":"Tipos de propiedad"}'::jsonb,
   '{"en":"What kinds of property you work with.","es":"Con qué tipos de propiedad trabajas."}'::jsonb,
   '{}'::jsonb,
   '{"Houses":{"en":"Houses","es":"Casas"},"Apartments and condos":{"en":"Apartments and condos","es":"Departamentos y condominios"},"Land and lots":{"en":"Land and lots","es":"Terrenos y lotes"},"Beachfront and vacation homes":{"en":"Beachfront and vacation homes","es":"Casas de playa y vacacionales"},"New developments":{"en":"New developments","es":"Desarrollos nuevos"},"Commercial spaces":{"en":"Commercial spaces","es":"Locales comerciales"},"Offices":{"en":"Offices","es":"Oficinas"},"Warehouses and industrial":{"en":"Warehouses and industrial","es":"Bodegas e industrial"},"Ranches and rural land":{"en":"Ranches and rural land","es":"Ranchos y terrenos rurales"}}'::jsonb),
  ('realestate.operations', 'context-best-fit', 'multiselect', '["Sales","Long-term rentals","Short-term and vacation rentals","Appraisals","Property management"]'::jsonb, false, ARRAY['public','agency']::text[], true, 20, NULL::jsonb, NULL::text,
   '{"en":"Operations handled","es":"Operaciones que atiende"}'::jsonb,
   '{"en":"Sales, rentals and related work you take on.","es":"Ventas, rentas y trabajos relacionados que atiendes."}'::jsonb,
   '{}'::jsonb,
   '{"Sales":{"en":"Sales","es":"Venta"},"Long-term rentals":{"en":"Long-term rentals","es":"Renta a largo plazo"},"Short-term and vacation rentals":{"en":"Short-term and vacation rentals","es":"Renta vacacional y de corta estancia"},"Appraisals":{"en":"Appraisals","es":"Avalúos"},"Property management":{"en":"Property management","es":"Administración de propiedades"}}'::jsonb),
  ('realestate.ampi_license', 'context-best-fit', 'text', NULL::jsonb, true, ARRAY['agency']::text[], false, 30, NULL::jsonb, NULL::text,
   '{"en":"AMPI or licence number","es":"Número de AMPI o licencia"}'::jsonb,
   '{"en":"Kept private. Used only by the team to verify you.","es":"Es privado. Solo el equipo lo usa para verificarte."}'::jsonb,
   '{}'::jsonb,
   '{}'::jsonb),
  ('paperwork.procedures_handled', 'context-best-fit', 'multiselect', '["Passports and visas","Residency and citizenship","Vehicle registration and plates","Driver''s licences","Business registration","Tax registrations (SAT)","Property deeds and titles","Birth, marriage and other certificates","Apostilles and legalisations","Municipal permits and licences","Customs and import permits","Social security (IMSS)"]'::jsonb, false, ARRAY['public','agency']::text[], true, 10, NULL::jsonb, NULL::text,
   '{"en":"Procedures handled","es":"Trámites que gestiona"}'::jsonb,
   '{"en":"The kinds of paperwork you take care of.","es":"Los tipos de trámites que gestionas."}'::jsonb,
   '{}'::jsonb,
   '{"Passports and visas":{"en":"Passports and visas","es":"Pasaportes y visas"},"Residency and citizenship":{"en":"Residency and citizenship","es":"Residencia y ciudadanía"},"Vehicle registration and plates":{"en":"Vehicle registration and plates","es":"Registro de vehículos y placas"},"Driver''s licences":{"en":"Driver''s licences","es":"Licencias de conducir"},"Business registration":{"en":"Business registration","es":"Alta de negocios y empresas"},"Tax registrations (SAT)":{"en":"Tax registrations (SAT)","es":"Registros fiscales (SAT)"},"Property deeds and titles":{"en":"Property deeds and titles","es":"Escrituras y títulos de propiedad"},"Birth, marriage and other certificates":{"en":"Birth, marriage and other certificates","es":"Actas de nacimiento, matrimonio y otras"},"Apostilles and legalisations":{"en":"Apostilles and legalisations","es":"Apostillas y legalizaciones"},"Municipal permits and licences":{"en":"Municipal permits and licences","es":"Permisos y licencias municipales"},"Customs and import permits":{"en":"Customs and import permits","es":"Permisos aduanales y de importación"},"Social security (IMSS)":{"en":"Social security (IMSS)","es":"Seguridad social (IMSS)"}}'::jsonb),
  ('paperwork.offices_covered', 'operational-requirements', 'chips', NULL::jsonb, false, ARRAY['public','agency']::text[], true, 20, NULL::jsonb, NULL::text,
   '{"en":"Offices covered","es":"Oficinas que cubre"}'::jsonb,
   '{"en":"Government offices and agencies you deal with, e.g. SAT, SRE, INM, municipal offices.","es":"Oficinas y dependencias con las que tramitas, por ejemplo SAT, SRE, INM, oficinas municipales."}'::jsonb,
   '{"en":"Add an office…","es":"Agrega una oficina…"}'::jsonb,
   '{}'::jsonb),
  ('svc.turnaround_days', 'operational-requirements', 'number', NULL::jsonb, false, ARRAY['public','agency']::text[], true, 30, '{"min":0,"max":365}'::jsonb, 'days',
   '{"en":"Typical turnaround","es":"Tiempo de entrega habitual"}'::jsonb,
   '{"en":"Usual time from request to delivery.","es":"Tiempo habitual desde la solicitud hasta la entrega."}'::jsonb,
   '{}'::jsonb,
   '{}'::jsonb),
  ('lang.language_pairs', 'context-best-fit', 'chips', NULL::jsonb, false, ARRAY['public','agency']::text[], true, 10, NULL::jsonb, NULL::text,
   '{"en":"Language pairs","es":"Combinaciones de idiomas"}'::jsonb,
   '{"en":"For example English to Spanish. Add each direction you work in.","es":"Por ejemplo inglés a español. Agrega cada dirección en la que trabajas."}'::jsonb,
   '{"en":"Add a pair, e.g. English to Spanish…","es":"Agrega una combinación, p. ej. inglés a español…"}'::jsonb,
   '{}'::jsonb),
  ('lang.specialties', 'context-best-fit', 'multiselect', '["Legal","Medical","Technical","Financial","Marketing and advertising","Literary","Academic","Tourism and hospitality","Website and software","Audio and video"]'::jsonb, false, ARRAY['public','agency']::text[], true, 20, NULL::jsonb, NULL::text,
   '{"en":"Specialties","es":"Especialidades"}'::jsonb,
   '{"en":"Subjects and content types you are strongest in.","es":"Temas y tipos de contenido en los que eres más fuerte."}'::jsonb,
   '{}'::jsonb,
   '{"Legal":{"en":"Legal","es":"Legal"},"Medical":{"en":"Medical","es":"Médico"},"Technical":{"en":"Technical","es":"Técnico"},"Financial":{"en":"Financial","es":"Financiero"},"Marketing and advertising":{"en":"Marketing and advertising","es":"Marketing y publicidad"},"Literary":{"en":"Literary","es":"Literario"},"Academic":{"en":"Academic","es":"Académico"},"Tourism and hospitality":{"en":"Tourism and hospitality","es":"Turismo y hospitalidad"},"Website and software":{"en":"Website and software","es":"Sitios web y software"},"Audio and video":{"en":"Audio and video","es":"Audio y video"}}'::jsonb),
  ('lang.certified_translation', 'context-best-fit', 'toggle', NULL::jsonb, false, ARRAY['public','agency']::text[], true, 30, NULL::jsonb, NULL::text,
   '{"en":"Certified translation","es":"Traducción certificada"}'::jsonb,
   '{"en":"Can issue official translations accepted by courts and agencies (perito traductor).","es":"Puede emitir traducciones oficiales aceptadas por juzgados y dependencias (perito traductor)."}'::jsonb,
   '{}'::jsonb,
   '{}'::jsonb),
  ('biz.tools', 'equipment-tools', 'chips', NULL::jsonb, false, ARRAY['public','agency']::text[], true, 10, NULL::jsonb, NULL::text,
   '{"en":"Tools and software","es":"Herramientas y software"}'::jsonb,
   '{"en":"Apps and platforms you work in, e.g. Notion, Asana, Zapier, HubSpot.","es":"Aplicaciones y plataformas con las que trabajas, por ejemplo Notion, Asana, Zapier, HubSpot."}'::jsonb,
   '{"en":"Add a tool…","es":"Agrega una herramienta…"}'::jsonb,
   '{}'::jsonb),
  ('biz.hours_per_week_available', 'operational-requirements', 'number', NULL::jsonb, false, ARRAY['public','agency']::text[], true, 20, '{"min":1,"max":80}'::jsonb, 'hrs/week',
   '{"en":"Hours available per week","es":"Horas disponibles por semana"}'::jsonb,
   '{"en":"How many hours a week you can take on for clients.","es":"Cuántas horas por semana puedes dedicar a clientes."}'::jsonb,
   '{}'::jsonb,
   '{}'::jsonb),
  ('biz.remote_only', 'operational-requirements', 'toggle', NULL::jsonb, false, ARRAY['public','agency']::text[], true, 30, NULL::jsonb, NULL::text,
   '{"en":"Works remotely only","es":"Trabaja solo a distancia"}'::jsonb,
   '{"en":"Does not take in-person work.","es":"No acepta trabajo presencial."}'::jsonb,
   '{}'::jsonb,
   '{}'::jsonb),
  ('birth.services', 'context-best-fit', 'multiselect', '["Birth support","Postpartum support","Breastfeeding and lactation support","Prenatal classes","Newborn care guidance","Sleep coaching","Loss and bereavement support"]'::jsonb, false, ARRAY['public','agency']::text[], true, 10, NULL::jsonb, NULL::text,
   '{"en":"Services offered","es":"Servicios que ofrece"}'::jsonb,
   '{"en":"The support you provide to families.","es":"El acompañamiento que brindas a las familias."}'::jsonb,
   '{}'::jsonb,
   '{"Birth support":{"en":"Birth support","es":"Acompañamiento en el parto"},"Postpartum support":{"en":"Postpartum support","es":"Acompañamiento en el posparto"},"Breastfeeding and lactation support":{"en":"Breastfeeding and lactation support","es":"Apoyo en lactancia"},"Prenatal classes":{"en":"Prenatal classes","es":"Clases prenatales"},"Newborn care guidance":{"en":"Newborn care guidance","es":"Orientación en cuidado del recién nacido"},"Sleep coaching":{"en":"Sleep coaching","es":"Asesoría de sueño"},"Loss and bereavement support":{"en":"Loss and bereavement support","es":"Acompañamiento en pérdida y duelo"}}'::jsonb),
  ('svc.home_visits', 'operational-requirements', 'toggle', NULL::jsonb, false, ARRAY['public','agency']::text[], true, 20, NULL::jsonb, NULL::text,
   '{"en":"Home visits","es":"Visitas a domicilio"}'::jsonb,
   '{"en":"Travels to the client''s home or location.","es":"Se traslada al domicilio o ubicación del cliente."}'::jsonb,
   '{}'::jsonb,
   '{}'::jsonb),
  ('tutor.subjects', 'context-best-fit', 'chips', NULL::jsonb, false, ARRAY['public','agency']::text[], true, 10, NULL::jsonb, NULL::text,
   '{"en":"Subjects","es":"Materias"}'::jsonb,
   '{"en":"Subjects you teach, e.g. algebra, chemistry, physics, TOEFL.","es":"Materias que enseñas, por ejemplo álgebra, química, física, TOEFL."}'::jsonb,
   '{"en":"Add a subject…","es":"Agrega una materia…"}'::jsonb,
   '{}'::jsonb),
  ('tutor.levels', 'context-best-fit', 'multiselect', '["Preschool","Primary school","Middle school","High school","University","Adult learners"]'::jsonb, false, ARRAY['public','agency']::text[], true, 20, NULL::jsonb, NULL::text,
   '{"en":"School levels","es":"Niveles escolares"}'::jsonb,
   '{"en":"Grades and levels you tutor.","es":"Grados y niveles que apoyas."}'::jsonb,
   '{}'::jsonb,
   '{"Preschool":{"en":"Preschool","es":"Preescolar"},"Primary school":{"en":"Primary school","es":"Primaria"},"Middle school":{"en":"Middle school","es":"Secundaria"},"High school":{"en":"High school","es":"Preparatoria"},"University":{"en":"University","es":"Universidad"},"Adult learners":{"en":"Adult learners","es":"Adultos"}}'::jsonb),
  ('svc.online_or_in_person', 'operational-requirements', 'multiselect', '["In person","Online"]'::jsonb, false, ARRAY['public','agency']::text[], true, 30, NULL::jsonb, NULL::text,
   '{"en":"Online or in person","es":"En línea o presencial"}'::jsonb,
   '{"en":"How you work with clients.","es":"Cómo trabajas con tus clientes."}'::jsonb,
   '{}'::jsonb,
   '{"In person":{"en":"In person","es":"Presencial"},"Online":{"en":"Online","es":"En línea"}}'::jsonb),
  ('tutor.class_sizes', 'operational-requirements', 'multiselect', '["One-on-one","Small group (2 to 5)","Larger group (6 or more)"]'::jsonb, false, ARRAY['public','agency']::text[], true, 40, NULL::jsonb, NULL::text,
   '{"en":"Class sizes","es":"Tamaño de grupo"}'::jsonb,
   '{"en":"One-on-one or group lessons.","es":"Clases individuales o en grupo."}'::jsonb,
   '{}'::jsonb,
   '{"One-on-one":{"en":"One-on-one","es":"Individual"},"Small group (2 to 5)":{"en":"Small group (2 to 5)","es":"Grupo pequeño (2 a 5)"},"Larger group (6 or more)":{"en":"Larger group (6 or more)","es":"Grupo grande (6 o más)"}}'::jsonb),
  ('techedu.languages_or_tools', 'context-best-fit', 'chips', NULL::jsonb, false, ARRAY['public','agency']::text[], true, 10, NULL::jsonb, NULL::text,
   '{"en":"Languages and tools taught","es":"Lenguajes y herramientas que enseña"}'::jsonb,
   '{"en":"e.g. Python, JavaScript, Excel, Canva, Scratch.","es":"Por ejemplo Python, JavaScript, Excel, Canva, Scratch."}'::jsonb,
   '{"en":"Add a language or tool…","es":"Agrega un lenguaje o herramienta…"}'::jsonb,
   '{}'::jsonb),
  ('svc.skill_levels', 'context-best-fit', 'multiselect', '["Beginner","Intermediate","Advanced"]'::jsonb, false, ARRAY['public','agency']::text[], true, 20, NULL::jsonb, NULL::text,
   '{"en":"Levels taught","es":"Niveles que enseña"}'::jsonb,
   '{"en":"Student levels you work with.","es":"Niveles de alumnos con los que trabajas."}'::jsonb,
   '{}'::jsonb,
   '{"Beginner":{"en":"Beginner","es":"Principiante"},"Intermediate":{"en":"Intermediate","es":"Intermedio"},"Advanced":{"en":"Advanced","es":"Avanzado"}}'::jsonb),
  ('lessons.instruments_or_disciplines', 'context-best-fit', 'chips', NULL::jsonb, false, ARRAY['public','agency']::text[], true, 10, NULL::jsonb, NULL::text,
   '{"en":"Instruments and disciplines","es":"Instrumentos y disciplinas"}'::jsonb,
   '{"en":"What you teach, e.g. guitar, piano, singing, creative writing.","es":"Lo que enseñas, por ejemplo guitarra, piano, canto, escritura creativa."}'::jsonb,
   '{"en":"Add an instrument or discipline…","es":"Agrega un instrumento o disciplina…"}'::jsonb,
   '{}'::jsonb),
  ('lessons.ages_taught', 'context-best-fit', 'multiselect', '["Children (4 to 12)","Teens (13 to 17)","Adults (18 and over)","Seniors"]'::jsonb, false, ARRAY['public','agency']::text[], true, 30, NULL::jsonb, NULL::text,
   '{"en":"Ages taught","es":"Edades que enseña"}'::jsonb,
   '{"en":"Age groups you teach.","es":"Grupos de edad con los que trabajas."}'::jsonb,
   '{}'::jsonb,
   '{"Children (4 to 12)":{"en":"Children (4 to 12)","es":"Niños (4 a 12)"},"Teens (13 to 17)":{"en":"Teens (13 to 17)","es":"Adolescentes (13 a 17)"},"Adults (18 and over)":{"en":"Adults (18 and over)","es":"Adultos (18 en adelante)"},"Seniors":{"en":"Seniors","es":"Adultos mayores"}}'::jsonb),
  ('lessons.lesson_location', 'operational-requirements', 'multiselect', '["At the student''s home","At my studio","Online"]'::jsonb, false, ARRAY['public','agency']::text[], true, 40, NULL::jsonb, NULL::text,
   '{"en":"Lesson location","es":"Dónde da las clases"}'::jsonb,
   '{"en":"Where lessons take place.","es":"Dónde se dan las clases."}'::jsonb,
   '{}'::jsonb,
   '{"At the student''s home":{"en":"At the student''s home","es":"En casa del alumno"},"At my studio":{"en":"At my studio","es":"En mi estudio"},"Online":{"en":"Online","es":"En línea"}}'::jsonb),
  ('driving.vehicles_taught', 'context-best-fit', 'multiselect', '["Car, automatic","Car, manual","Motorcycle","Scooter","Van or small truck"]'::jsonb, false, ARRAY['public','agency']::text[], true, 10, NULL::jsonb, NULL::text,
   '{"en":"Vehicles taught","es":"Vehículos que enseña"}'::jsonb,
   '{"en":"What students learn to drive.","es":"En qué vehículos enseñas a manejar."}'::jsonb,
   '{}'::jsonb,
   '{"Car, automatic":{"en":"Car, automatic","es":"Auto automático"},"Car, manual":{"en":"Car, manual","es":"Auto estándar"},"Motorcycle":{"en":"Motorcycle","es":"Motocicleta"},"Scooter":{"en":"Scooter","es":"Scooter"},"Van or small truck":{"en":"Van or small truck","es":"Camioneta o vehículo pequeño de carga"}}'::jsonb),
  ('driving.help_offered', 'context-best-fit', 'multiselect', '["First licence preparation","Written test preparation","Driving test practice","Refresher lessons","Nervous driver support","Defensive driving"]'::jsonb, false, ARRAY['public','agency']::text[], true, 20, NULL::jsonb, NULL::text,
   '{"en":"Licence help offered","es":"Apoyo para la licencia"}'::jsonb,
   '{"en":"What you help students with.","es":"En qué ayudas a tus alumnos."}'::jsonb,
   '{}'::jsonb,
   '{"First licence preparation":{"en":"First licence preparation","es":"Preparación para la primera licencia"},"Written test preparation":{"en":"Written test preparation","es":"Preparación del examen teórico"},"Driving test practice":{"en":"Driving test practice","es":"Práctica para el examen de manejo"},"Refresher lessons":{"en":"Refresher lessons","es":"Clases de repaso"},"Nervous driver support":{"en":"Nervous driver support","es":"Apoyo para conductores con miedo"},"Defensive driving":{"en":"Defensive driving","es":"Manejo defensivo"}}'::jsonb),
  ('design.styles', 'context-best-fit', 'chips', NULL::jsonb, false, ARRAY['public','agency']::text[], true, 10, NULL::jsonb, NULL::text,
   '{"en":"Styles","es":"Estilos"}'::jsonb,
   '{"en":"e.g. minimal, hand-drawn, editorial, retro, bold.","es":"Por ejemplo minimalista, dibujado a mano, editorial, retro, atrevido."}'::jsonb,
   '{"en":"Add a style…","es":"Agrega un estilo…"}'::jsonb,
   '{}'::jsonb),
  ('design.deliverables', 'context-best-fit', 'multiselect', '["Logo","Brand identity","Packaging","Print (flyers, menus, posters)","Social media graphics","Illustrations","Character design","Editorial and book layout","Merchandise and apparel","Murals and signage"]'::jsonb, false, ARRAY['public','agency']::text[], true, 20, NULL::jsonb, NULL::text,
   '{"en":"Deliverables","es":"Entregables"}'::jsonb,
   '{"en":"What clients usually receive from you.","es":"Lo que suelen recibir tus clientes."}'::jsonb,
   '{}'::jsonb,
   '{"Logo":{"en":"Logo","es":"Logotipo"},"Brand identity":{"en":"Brand identity","es":"Identidad de marca"},"Packaging":{"en":"Packaging","es":"Empaques"},"Print (flyers, menus, posters)":{"en":"Print (flyers, menus, posters)","es":"Impresos (volantes, menús, carteles)"},"Social media graphics":{"en":"Social media graphics","es":"Gráficos para redes sociales"},"Illustrations":{"en":"Illustrations","es":"Ilustraciones"},"Character design":{"en":"Character design","es":"Diseño de personajes"},"Editorial and book layout":{"en":"Editorial and book layout","es":"Diseño editorial y de libros"},"Merchandise and apparel":{"en":"Merchandise and apparel","es":"Mercancía y ropa"},"Murals and signage":{"en":"Murals and signage","es":"Murales y rotulación"}}'::jsonb),
  ('design.software', 'equipment-tools', 'chips', NULL::jsonb, false, ARRAY['public','agency']::text[], true, 30, NULL::jsonb, NULL::text,
   '{"en":"Software","es":"Software"}'::jsonb,
   '{"en":"e.g. Illustrator, Photoshop, Figma, Procreate.","es":"Por ejemplo Illustrator, Photoshop, Figma, Procreate."}'::jsonb,
   '{"en":"Add software…","es":"Agrega software…"}'::jsonb,
   '{}'::jsonb),
  ('design.revisions_included', 'operational-requirements', 'number', NULL::jsonb, false, ARRAY['public','agency']::text[], true, 40, '{"min":0,"max":20}'::jsonb, 'rounds',
   '{"en":"Revisions included","es":"Revisiones incluidas"}'::jsonb,
   '{"en":"Rounds of changes included in your price.","es":"Rondas de cambios incluidas en tu precio."}'::jsonb,
   '{}'::jsonb,
   '{}'::jsonb),
  ('webprod.platforms', 'equipment-tools', 'chips', NULL::jsonb, false, ARRAY['public','agency']::text[], true, 10, NULL::jsonb, NULL::text,
   '{"en":"Platforms and tools","es":"Plataformas y herramientas"}'::jsonb,
   '{"en":"e.g. Webflow, WordPress, Shopify, Figma, SolidWorks, Blender.","es":"Por ejemplo Webflow, WordPress, Shopify, Figma, SolidWorks, Blender."}'::jsonb,
   '{"en":"Add a platform or tool…","es":"Agrega una plataforma o herramienta…"}'::jsonb,
   '{}'::jsonb),
  ('webprod.deliverables', 'context-best-fit', 'multiselect', '["Websites","Online stores","Landing pages","App interfaces (UI)","UX research and prototypes","Design systems","Product and CAD models","3D renders and animation"]'::jsonb, false, ARRAY['public','agency']::text[], true, 20, NULL::jsonb, NULL::text,
   '{"en":"Deliverables","es":"Entregables"}'::jsonb,
   '{"en":"What you design and hand over.","es":"Lo que diseñas y entregas."}'::jsonb,
   '{}'::jsonb,
   '{"Websites":{"en":"Websites","es":"Sitios web"},"Online stores":{"en":"Online stores","es":"Tiendas en línea"},"Landing pages":{"en":"Landing pages","es":"Páginas de aterrizaje"},"App interfaces (UI)":{"en":"App interfaces (UI)","es":"Interfaces de apps (UI)"},"UX research and prototypes":{"en":"UX research and prototypes","es":"Investigación UX y prototipos"},"Design systems":{"en":"Design systems","es":"Sistemas de diseño"},"Product and CAD models":{"en":"Product and CAD models","es":"Productos y modelos CAD"},"3D renders and animation":{"en":"3D renders and animation","es":"Renders y animación 3D"}}'::jsonb),
  ('dev.stack', 'equipment-tools', 'chips', NULL::jsonb, false, ARRAY['public','agency']::text[], true, 10, NULL::jsonb, NULL::text,
   '{"en":"Tech stack and tools","es":"Tecnologías y herramientas"}'::jsonb,
   '{"en":"Languages, frameworks and tools you work with.","es":"Lenguajes, frameworks y herramientas con los que trabajas."}'::jsonb,
   '{"en":"Add a technology…","es":"Agrega una tecnología…"}'::jsonb,
   '{}'::jsonb),
  ('dev.project_types', 'context-best-fit', 'multiselect', '["Websites","Web apps","Mobile apps","Online stores","APIs and integrations","Automations and scripts","Data and dashboards","SEO and site audits","Games"]'::jsonb, false, ARRAY['public','agency']::text[], true, 20, NULL::jsonb, NULL::text,
   '{"en":"Project types","es":"Tipos de proyecto"}'::jsonb,
   '{"en":"The kinds of projects you take on.","es":"Los tipos de proyectos que aceptas."}'::jsonb,
   '{}'::jsonb,
   '{"Websites":{"en":"Websites","es":"Sitios web"},"Web apps":{"en":"Web apps","es":"Aplicaciones web"},"Mobile apps":{"en":"Mobile apps","es":"Aplicaciones móviles"},"Online stores":{"en":"Online stores","es":"Tiendas en línea"},"APIs and integrations":{"en":"APIs and integrations","es":"APIs e integraciones"},"Automations and scripts":{"en":"Automations and scripts","es":"Automatizaciones y scripts"},"Data and dashboards":{"en":"Data and dashboards","es":"Datos y tableros"},"SEO and site audits":{"en":"SEO and site audits","es":"SEO y auditorías de sitios"},"Games":{"en":"Games","es":"Videojuegos"}}'::jsonb),
  ('dev.maintenance_offered', 'operational-requirements', 'toggle', NULL::jsonb, false, ARRAY['public','agency']::text[], true, 30, NULL::jsonb, NULL::text,
   '{"en":"Ongoing maintenance offered","es":"Ofrece mantenimiento continuo"}'::jsonb,
   '{"en":"Keeps projects updated and supported after launch.","es":"Mantiene y da soporte a los proyectos después del lanzamiento."}'::jsonb,
   '{}'::jsonb,
   '{}'::jsonb),
  ('jewelry.materials', 'context-best-fit', 'multiselect', '["Gold","Silver","Platinum","Copper and brass","Gemstones","Pearls","Beads and natural materials","Steel"]'::jsonb, false, ARRAY['public','agency']::text[], true, 10, NULL::jsonb, NULL::text,
   '{"en":"Materials","es":"Materiales"}'::jsonb,
   '{"en":"What you work with.","es":"Con qué materiales trabajas."}'::jsonb,
   '{}'::jsonb,
   '{"Gold":{"en":"Gold","es":"Oro"},"Silver":{"en":"Silver","es":"Plata"},"Platinum":{"en":"Platinum","es":"Platino"},"Copper and brass":{"en":"Copper and brass","es":"Cobre y latón"},"Gemstones":{"en":"Gemstones","es":"Piedras preciosas"},"Pearls":{"en":"Pearls","es":"Perlas"},"Beads and natural materials":{"en":"Beads and natural materials","es":"Chaquira y materiales naturales"},"Steel":{"en":"Steel","es":"Acero"}}'::jsonb),
  ('svc.custom_orders', 'operational-requirements', 'toggle', NULL::jsonb, false, ARRAY['public','agency']::text[], true, 20, NULL::jsonb, NULL::text,
   '{"en":"Accepts custom orders","es":"Acepta pedidos a medida"}'::jsonb,
   '{"en":"Makes pieces to order for a client.","es":"Elabora piezas por encargo para un cliente."}'::jsonb,
   '{}'::jsonb,
   '{}'::jsonb),
  ('handcraft.materials', 'context-best-fit', 'multiselect', '["Clay and ceramics","Leather","Wood","Fabric and thread","Paper and ink","Glass","Metal","Wax and resin","Natural fibers"]'::jsonb, false, ARRAY['public','agency']::text[], true, 10, NULL::jsonb, NULL::text,
   '{"en":"Materials","es":"Materiales"}'::jsonb,
   '{"en":"What you work with.","es":"Con qué materiales trabajas."}'::jsonb,
   '{}'::jsonb,
   '{"Clay and ceramics":{"en":"Clay and ceramics","es":"Barro y cerámica"},"Leather":{"en":"Leather","es":"Piel"},"Wood":{"en":"Wood","es":"Madera"},"Fabric and thread":{"en":"Fabric and thread","es":"Tela e hilo"},"Paper and ink":{"en":"Paper and ink","es":"Papel y tinta"},"Glass":{"en":"Glass","es":"Vidrio"},"Metal":{"en":"Metal","es":"Metal"},"Wax and resin":{"en":"Wax and resin","es":"Cera y resina"},"Natural fibers":{"en":"Natural fibers","es":"Fibras naturales"}}'::jsonb),
  ('handcraft.classes_offered', 'context-best-fit', 'toggle', NULL::jsonb, false, ARRAY['public','agency']::text[], true, 30, NULL::jsonb, NULL::text,
   '{"en":"Teaches classes or workshops","es":"Imparte clases o talleres"}'::jsonb,
   '{"en":"Offers lessons in your craft.","es":"Ofrece clases de tu oficio."}'::jsonb,
   '{}'::jsonb,
   '{}'::jsonb),
  ('handcraft.shipping', 'operational-requirements', 'multiselect', '["Pickup only","Local delivery","Ships within the country","Ships internationally"]'::jsonb, false, ARRAY['public','agency']::text[], true, 40, NULL::jsonb, NULL::text,
   '{"en":"Delivery and shipping","es":"Entrega y envíos"}'::jsonb,
   '{"en":"How finished pieces reach the client.","es":"Cómo llegan las piezas terminadas al cliente."}'::jsonb,
   '{}'::jsonb,
   '{"Pickup only":{"en":"Pickup only","es":"Solo recoger"},"Local delivery":{"en":"Local delivery","es":"Entrega local"},"Ships within the country":{"en":"Ships within the country","es":"Envíos nacionales"},"Ships internationally":{"en":"Ships internationally","es":"Envíos internacionales"}}'::jsonb),
  ('sewing.services', 'context-best-fit', 'chips', NULL::jsonb, false, ARRAY['public','agency']::text[], true, 10, NULL::jsonb, NULL::text,
   '{"en":"Services offered","es":"Servicios que ofrece"}'::jsonb,
   '{"en":"e.g. hemming, tailoring, zippers, reupholstery, resoling.","es":"Por ejemplo dobladillos, sastrería, cierres, retapizado, cambio de suelas."}'::jsonb,
   '{"en":"Add a service…","es":"Agrega un servicio…"}'::jsonb,
   '{}'::jsonb),
  ('sewing.pickup_delivery', 'operational-requirements', 'toggle', NULL::jsonb, false, ARRAY['public','agency']::text[], true, 30, NULL::jsonb, NULL::text,
   '{"en":"Pickup and delivery","es":"Recolección y entrega"}'::jsonb,
   '{"en":"Collects items from the client and brings them back.","es":"Recoge las piezas con el cliente y las devuelve."}'::jsonb,
   '{}'::jsonb,
   '{}'::jsonb),
  ('pets.species', 'context-best-fit', 'multiselect', '["Dogs","Cats","Birds","Rabbits and small mammals","Reptiles","Fish","Horses","Farm animals"]'::jsonb, false, ARRAY['public','agency']::text[], true, 10, NULL::jsonb, NULL::text,
   '{"en":"Animals cared for","es":"Animales que atiende"}'::jsonb,
   '{"en":"Which animals you work with.","es":"Con qué animales trabajas."}'::jsonb,
   '{}'::jsonb,
   '{"Dogs":{"en":"Dogs","es":"Perros"},"Cats":{"en":"Cats","es":"Gatos"},"Birds":{"en":"Birds","es":"Aves"},"Rabbits and small mammals":{"en":"Rabbits and small mammals","es":"Conejos y mamíferos pequeños"},"Reptiles":{"en":"Reptiles","es":"Reptiles"},"Fish":{"en":"Fish","es":"Peces"},"Horses":{"en":"Horses","es":"Caballos"},"Farm animals":{"en":"Farm animals","es":"Animales de granja"}}'::jsonb),
  ('pets.sizes', 'context-best-fit', 'multiselect', '["Small (up to 10 kg)","Medium (10 to 25 kg)","Large (25 to 45 kg)","Giant (over 45 kg)"]'::jsonb, false, ARRAY['public','agency']::text[], true, 20, NULL::jsonb, NULL::text,
   '{"en":"Pet sizes","es":"Tamaños de mascota"}'::jsonb,
   '{"en":"Sizes you are comfortable handling.","es":"Tamaños con los que te sientes cómodo."}'::jsonb,
   '{}'::jsonb,
   '{"Small (up to 10 kg)":{"en":"Small (up to 10 kg)","es":"Pequeño (hasta 10 kg)"},"Medium (10 to 25 kg)":{"en":"Medium (10 to 25 kg)","es":"Mediano (10 a 25 kg)"},"Large (25 to 45 kg)":{"en":"Large (25 to 45 kg)","es":"Grande (25 a 45 kg)"},"Giant (over 45 kg)":{"en":"Giant (over 45 kg)","es":"Gigante (más de 45 kg)"}}'::jsonb),
  ('pets.max_pets', 'operational-requirements', 'number', NULL::jsonb, false, ARRAY['public','agency']::text[], true, 30, '{"min":1,"max":30}'::jsonb, 'pets',
   '{"en":"Max pets at once","es":"Máximo de mascotas a la vez"}'::jsonb,
   '{"en":"Most animals you look after at the same time.","es":"Máximo de animales que cuidas al mismo tiempo."}'::jsonb,
   '{}'::jsonb,
   '{}'::jsonb),
  ('pets.service_location', 'operational-requirements', 'multiselect', '["At the client''s home","At my studio or facility"]'::jsonb, false, ARRAY['public','agency']::text[], true, 30, NULL::jsonb, NULL::text,
   '{"en":"Service location","es":"Dónde da el servicio"}'::jsonb,
   '{"en":"Where the service takes place.","es":"Dónde se realiza el servicio."}'::jsonb,
   '{}'::jsonb,
   '{"At the client''s home":{"en":"At the client''s home","es":"En casa del cliente"},"At my studio or facility":{"en":"At my studio or facility","es":"En mi estudio o instalaciones"}}'::jsonb),
  ('sound.daw', 'equipment-tools', 'chips', NULL::jsonb, false, ARRAY['public','agency']::text[], true, 10, NULL::jsonb, NULL::text,
   '{"en":"DAWs and software","es":"DAWs y software"}'::jsonb,
   '{"en":"e.g. Ableton Live, Logic Pro, Pro Tools, FL Studio.","es":"Por ejemplo Ableton Live, Logic Pro, Pro Tools, FL Studio."}'::jsonb,
   '{"en":"Add a DAW or plugin…","es":"Agrega un DAW o plugin…"}'::jsonb,
   '{}'::jsonb),
  ('sound.deliverables', 'context-best-fit', 'multiselect', '["Full productions","Beats and instrumentals","Mixing","Mastering","Sound design and effects","Podcast and voice-over audio","Film and game audio","Jingles and audio branding","Stems and multitracks"]'::jsonb, false, ARRAY['public','agency']::text[], true, 20, NULL::jsonb, NULL::text,
   '{"en":"Deliverables","es":"Entregables"}'::jsonb,
   '{"en":"What clients receive from you.","es":"Lo que reciben tus clientes."}'::jsonb,
   '{}'::jsonb,
   '{"Full productions":{"en":"Full productions","es":"Producciones completas"},"Beats and instrumentals":{"en":"Beats and instrumentals","es":"Beats e instrumentales"},"Mixing":{"en":"Mixing","es":"Mezcla"},"Mastering":{"en":"Mastering","es":"Masterización"},"Sound design and effects":{"en":"Sound design and effects","es":"Diseño sonoro y efectos"},"Podcast and voice-over audio":{"en":"Podcast and voice-over audio","es":"Audio de podcast y locución"},"Film and game audio":{"en":"Film and game audio","es":"Audio para cine y videojuegos"},"Jingles and audio branding":{"en":"Jingles and audio branding","es":"Jingles e identidad sonora"},"Stems and multitracks":{"en":"Stems and multitracks","es":"Stems y multipistas"}}'::jsonb),
  ('eventplan.guest_sizes', 'operational-requirements', 'multiselect', '["Intimate (under 30)","Small (30 to 80)","Medium (80 to 200)","Large (200 to 500)","Very large (over 500)"]'::jsonb, false, ARRAY['public','agency']::text[], true, 10, NULL::jsonb, NULL::text,
   '{"en":"Guest count range","es":"Rango de invitados"}'::jsonb,
   '{"en":"Event sizes you plan.","es":"Tamaños de evento que organizas."}'::jsonb,
   '{}'::jsonb,
   '{"Intimate (under 30)":{"en":"Intimate (under 30)","es":"Íntimo (menos de 30)"},"Small (30 to 80)":{"en":"Small (30 to 80)","es":"Pequeño (30 a 80)"},"Medium (80 to 200)":{"en":"Medium (80 to 200)","es":"Mediano (80 a 200)"},"Large (200 to 500)":{"en":"Large (200 to 500)","es":"Grande (200 a 500)"},"Very large (over 500)":{"en":"Very large (over 500)","es":"Muy grande (más de 500)"}}'::jsonb),
  ('eventplan.vendor_network', 'operational-requirements', 'multiselect', '["Venues","Catering","Bar and beverages","Photo and video","Music and DJs","Florals and decor","Rentals (tables, chairs, tents)","Entertainment","Cakes and desserts","Lighting and AV","Transportation"]'::jsonb, false, ARRAY['public','agency']::text[], true, 20, NULL::jsonb, NULL::text,
   '{"en":"Vendor network","es":"Red de proveedores"}'::jsonb,
   '{"en":"Suppliers you already work with and can bring in.","es":"Proveedores con los que ya trabajas y puedes sumar."}'::jsonb,
   '{}'::jsonb,
   '{"Venues":{"en":"Venues","es":"Salones y locaciones"},"Catering":{"en":"Catering","es":"Banquetes"},"Bar and beverages":{"en":"Bar and beverages","es":"Bar y bebidas"},"Photo and video":{"en":"Photo and video","es":"Foto y video"},"Music and DJs":{"en":"Music and DJs","es":"Música y DJs"},"Florals and decor":{"en":"Florals and decor","es":"Flores y decoración"},"Rentals (tables, chairs, tents)":{"en":"Rentals (tables, chairs, tents)","es":"Renta de mobiliario (mesas, sillas, carpas)"},"Entertainment":{"en":"Entertainment","es":"Entretenimiento"},"Cakes and desserts":{"en":"Cakes and desserts","es":"Pasteles y postres"},"Lighting and AV":{"en":"Lighting and AV","es":"Iluminación y audio"},"Transportation":{"en":"Transportation","es":"Transporte"}}'::jsonb),
  ('techrepair.devices', 'context-best-fit', 'multiselect', '["Laptops","Desktop computers","Phones","Tablets","Printers","Networks and Wi-Fi","TVs and screens","Game consoles","Smart home devices"]'::jsonb, false, ARRAY['public','agency']::text[], true, 10, NULL::jsonb, NULL::text,
   '{"en":"Devices repaired","es":"Dispositivos que repara"}'::jsonb,
   '{"en":"The devices you work on.","es":"Los dispositivos en los que trabajas."}'::jsonb,
   '{}'::jsonb,
   '{"Laptops":{"en":"Laptops","es":"Laptops"},"Desktop computers":{"en":"Desktop computers","es":"Computadoras de escritorio"},"Phones":{"en":"Phones","es":"Celulares"},"Tablets":{"en":"Tablets","es":"Tabletas"},"Printers":{"en":"Printers","es":"Impresoras"},"Networks and Wi-Fi":{"en":"Networks and Wi-Fi","es":"Redes y Wi-Fi"},"TVs and screens":{"en":"TVs and screens","es":"Televisores y pantallas"},"Game consoles":{"en":"Game consoles","es":"Consolas de videojuegos"},"Smart home devices":{"en":"Smart home devices","es":"Dispositivos de casa inteligente"}}'::jsonb),
  ('techrepair.brands', 'equipment-tools', 'chips', NULL::jsonb, false, ARRAY['public','agency']::text[], true, 20, NULL::jsonb, NULL::text,
   '{"en":"Brands serviced","es":"Marcas que atiende"}'::jsonb,
   '{"en":"e.g. Apple, Samsung, Dell, HP, Lenovo.","es":"Por ejemplo Apple, Samsung, Dell, HP, Lenovo."}'::jsonb,
   '{"en":"Add a brand…","es":"Agrega una marca…"}'::jsonb,
   '{}'::jsonb),
  ('svc.warranty_days', 'operational-requirements', 'number', NULL::jsonb, false, ARRAY['public','agency']::text[], true, 40, '{"min":0,"max":3650}'::jsonb, 'days',
   '{"en":"Warranty on work","es":"Garantía del trabajo"}'::jsonb,
   '{"en":"How long your work is guaranteed. Enter 0 if none.","es":"Cuánto tiempo garantizas tu trabajo. Escribe 0 si no ofreces garantía."}'::jsonb,
   '{}'::jsonb,
   '{}'::jsonb),
  ('vehiclecare.vehicle_types', 'context-best-fit', 'multiselect', '["Cars","SUVs and pickups","Vans and light trucks","Motorcycles","Bicycles","E-bikes and scooters"]'::jsonb, false, ARRAY['public','agency']::text[], true, 10, NULL::jsonb, NULL::text,
   '{"en":"Vehicles serviced","es":"Vehículos que atiende"}'::jsonb,
   '{"en":"The vehicles you work on.","es":"Los vehículos en los que trabajas."}'::jsonb,
   '{}'::jsonb,
   '{"Cars":{"en":"Cars","es":"Autos"},"SUVs and pickups":{"en":"SUVs and pickups","es":"SUVs y camionetas"},"Vans and light trucks":{"en":"Vans and light trucks","es":"Vans y camiones ligeros"},"Motorcycles":{"en":"Motorcycles","es":"Motocicletas"},"Bicycles":{"en":"Bicycles","es":"Bicicletas"},"E-bikes and scooters":{"en":"E-bikes and scooters","es":"Bicicletas eléctricas y scooters"}}'::jsonb);

INSERT INTO public.profile_field_definitions
  (field_key, tier, section, kind, options, is_optional, is_sensitive,
   default_visibility, show_in_registration, show_in_edit_drawer, show_in_public,
   talent_editable, display_order, field_group_id, validation_rules, unit,
   render_mode, storage_mode, note,
   label_i18n, helper_i18n, placeholder_i18n, option_labels_i18n)
SELECT
  t.field_key, 'type-specific', 'type-specific', t.kind, t.options, true, t.is_sensitive,
  t.default_visibility, true, true, t.show_in_public,
  true, t.display_order, g.id, t.validation_rules, t.unit,
  'catalog', 'field_values', 'taxonomy expansion 2A (20261231298200)',
  t.label_i18n, t.helper_i18n, t.placeholder_i18n, t.option_labels_i18n
FROM _tx2a_fields t
LEFT JOIN public.profile_field_groups g ON g.slug = t.group_slug
ON CONFLICT (field_key) DO NOTHING;

-- 2. Recommendations (field x talent_type, by slug) ----------------------------
CREATE TEMP TABLE _tx2a_recs (
  field_key text NOT NULL, type_slug text NOT NULL,
  display_order int NOT NULL, requires_verification boolean NOT NULL,
  PRIMARY KEY (field_key, type_slug)
);

INSERT INTO _tx2a_recs (field_key, type_slug, display_order, requires_verification)
SELECT r.field_key, s.slug, r.display_order, r.requires_verification
FROM (VALUES
  ('realestate.property_types', ARRAY['real-estate-agent','property-appraiser','property-manager']::text[], 10, false),
  ('realestate.operations', ARRAY['real-estate-agent','property-appraiser','property-manager']::text[], 20, false),
  ('realestate.ampi_license', ARRAY['real-estate-agent','property-appraiser','property-manager']::text[], 30, true),
  ('paperwork.procedures_handled', ARRAY['paperwork-agent','customs-broker']::text[], 10, false),
  ('paperwork.offices_covered', ARRAY['paperwork-agent','customs-broker']::text[], 20, false),
  ('svc.turnaround_days', ARRAY['paperwork-agent','customs-broker']::text[], 30, false),
  ('lang.language_pairs', ARRAY['translator','interpreter','transcriptionist']::text[], 10, false),
  ('lang.specialties', ARRAY['translator','interpreter','copywriter','proofreader','transcriptionist','content-writer']::text[], 20, false),
  ('lang.certified_translation', ARRAY['translator','interpreter']::text[], 30, false),
  ('svc.turnaround_days', ARRAY['translator','copywriter','proofreader','transcriptionist','content-writer']::text[], 40, false),
  ('biz.tools', ARRAY['virtual-assistant','project-manager','automation-consultant','social-media-manager','marketing-consultant','recruiter']::text[], 10, false),
  ('biz.hours_per_week_available', ARRAY['virtual-assistant','project-manager','automation-consultant','social-media-manager','marketing-consultant','recruiter']::text[], 20, false),
  ('biz.remote_only', ARRAY['virtual-assistant','project-manager','automation-consultant','social-media-manager','marketing-consultant','recruiter']::text[], 30, false),
  ('birth.services', ARRAY['doula','lactation-consultant']::text[], 10, false),
  ('svc.home_visits', ARRAY['doula','lactation-consultant']::text[], 20, false),
  ('tutor.subjects', ARRAY['math-tutor','science-tutor','exam-prep-tutor','school-tutor','special-education-tutor']::text[], 10, false),
  ('tutor.levels', ARRAY['math-tutor','science-tutor','exam-prep-tutor','school-tutor','special-education-tutor']::text[], 20, false),
  ('svc.online_or_in_person', ARRAY['math-tutor','science-tutor','exam-prep-tutor','school-tutor','special-education-tutor']::text[], 30, false),
  ('tutor.class_sizes', ARRAY['math-tutor','science-tutor','exam-prep-tutor','school-tutor','special-education-tutor']::text[], 40, false),
  ('techedu.languages_or_tools', ARRAY['coding-tutor','computer-classes']::text[], 10, false),
  ('svc.skill_levels', ARRAY['coding-tutor','computer-classes']::text[], 20, false),
  ('svc.online_or_in_person', ARRAY['coding-tutor','computer-classes']::text[], 30, false),
  ('lessons.instruments_or_disciplines', ARRAY['music-teacher','guitar-teacher','piano-teacher','voice-teacher','writing-coach']::text[], 10, false),
  ('svc.skill_levels', ARRAY['music-teacher','guitar-teacher','piano-teacher','voice-teacher','writing-coach']::text[], 20, false),
  ('lessons.ages_taught', ARRAY['music-teacher','guitar-teacher','piano-teacher','voice-teacher','writing-coach']::text[], 30, false),
  ('lessons.lesson_location', ARRAY['music-teacher','guitar-teacher','piano-teacher','voice-teacher','writing-coach']::text[], 40, false),
  ('driving.vehicles_taught', ARRAY['driving-instructor']::text[], 10, false),
  ('driving.help_offered', ARRAY['driving-instructor']::text[], 20, false),
  ('design.styles', ARRAY['graphic-designer','illustrator','mural-artist','brand-designer']::text[], 10, false),
  ('design.deliverables', ARRAY['graphic-designer','illustrator','mural-artist','brand-designer']::text[], 20, false),
  ('design.software', ARRAY['graphic-designer','illustrator','brand-designer']::text[], 30, false),
  ('design.revisions_included', ARRAY['graphic-designer','illustrator','mural-artist','brand-designer']::text[], 40, false),
  ('webprod.platforms', ARRAY['web-designer','ux-designer','industrial-designer','3d-designer']::text[], 10, false),
  ('webprod.deliverables', ARRAY['web-designer','ux-designer','industrial-designer','3d-designer']::text[], 20, false),
  ('dev.stack', ARRAY['software-developer','app-developer','seo-specialist']::text[], 10, false),
  ('dev.project_types', ARRAY['software-developer','app-developer','seo-specialist']::text[], 20, false),
  ('dev.maintenance_offered', ARRAY['software-developer','app-developer']::text[], 30, false),
  ('jewelry.materials', ARRAY['jewelry-designer','jewelry-repair','silversmith','goldsmith','gemstone-setter']::text[], 10, false),
  ('svc.custom_orders', ARRAY['jewelry-designer','silversmith','goldsmith','gemstone-setter']::text[], 20, false),
  ('svc.turnaround_days', ARRAY['jewelry-designer','jewelry-repair','silversmith','goldsmith','gemstone-setter','watch-repair']::text[], 30, false),
  ('handcraft.materials', ARRAY['ceramist','leatherworker','embroidery-artist','calligrapher','woodworker']::text[], 10, false),
  ('svc.custom_orders', ARRAY['ceramist','leatherworker','embroidery-artist','calligrapher','woodworker']::text[], 20, false),
  ('handcraft.classes_offered', ARRAY['ceramist','leatherworker','embroidery-artist','calligrapher','woodworker']::text[], 30, false),
  ('handcraft.shipping', ARRAY['ceramist','leatherworker','embroidery-artist','calligrapher','woodworker']::text[], 40, false),
  ('svc.turnaround_days', ARRAY['ceramist','leatherworker','embroidery-artist','calligrapher','woodworker']::text[], 50, false),
  ('sewing.services', ARRAY['seamstress','upholsterer','shoe-repair','furniture-restorer']::text[], 10, false),
  ('svc.turnaround_days', ARRAY['seamstress','upholsterer','shoe-repair','furniture-restorer']::text[], 20, false),
  ('sewing.pickup_delivery', ARRAY['seamstress','upholsterer','shoe-repair','furniture-restorer']::text[], 30, false),
  ('pets.species', ARRAY['dog-walker','pet-sitter','cat-sitter','pet-daycare']::text[], 10, false),
  ('pets.sizes', ARRAY['dog-walker','pet-sitter','pet-daycare']::text[], 20, false),
  ('pets.max_pets', ARRAY['dog-walker','pet-sitter','cat-sitter','pet-daycare']::text[], 30, false),
  ('pets.species', ARRAY['dog-groomer','dog-trainer']::text[], 10, false),
  ('pets.sizes', ARRAY['dog-groomer','dog-trainer']::text[], 20, false),
  ('pets.service_location', ARRAY['dog-groomer','dog-trainer']::text[], 30, false),
  ('sound.daw', ARRAY['music-producer','sound-designer','mixing-engineer']::text[], 10, false),
  ('sound.deliverables', ARRAY['music-producer','sound-designer','mixing-engineer']::text[], 20, false),
  ('eventplan.guest_sizes', ARRAY['wedding-planner','event-planner','kids-party-planner','wedding-officiant']::text[], 10, false),
  ('eventplan.vendor_network', ARRAY['wedding-planner','event-planner','kids-party-planner']::text[], 20, false),
  ('techrepair.devices', ARRAY['computer-technician','phone-repair','it-support']::text[], 10, false),
  ('techrepair.brands', ARRAY['computer-technician','phone-repair','it-support']::text[], 20, false),
  ('svc.home_visits', ARRAY['computer-technician','phone-repair','it-support']::text[], 30, false),
  ('svc.warranty_days', ARRAY['computer-technician','phone-repair','it-support']::text[], 40, false),
  ('svc.warranty_days', ARRAY['pest-control','solar-installer']::text[], 10, false),
  ('vehiclecare.vehicle_types', ARRAY['mobile-mechanic','auto-detailer','car-wash','bicycle-mechanic']::text[], 10, false),
  ('svc.home_visits', ARRAY['mobile-mechanic','auto-detailer','car-wash','bicycle-mechanic']::text[], 20, false)
) AS r(field_key, type_slugs, display_order, requires_verification)
CROSS JOIN LATERAL unnest(r.type_slugs) AS s(slug);

INSERT INTO public.profile_field_recommendations
  (field_definition_id, taxonomy_term_id, relationship, display_order, requires_verification)
SELECT fd.id, tt.id, 'recommended', r.display_order, r.requires_verification
FROM _tx2a_recs r
JOIN public.profile_field_definitions fd
  ON fd.field_key = r.field_key AND fd.deprecated_at IS NULL
JOIN public.taxonomy_terms tt
  ON tt.slug = r.type_slug AND tt.term_type = 'talent_type'
ON CONFLICT (field_definition_id, taxonomy_term_id, relationship) DO NOTHING;

-- 3. Parent category -> field group mapping for the 6 new parents ---------------
INSERT INTO public.parent_category_field_groups
  (parent_category_id, field_group_id, is_default, weight, display_order,
   in_registration_wizard, in_profile_editor, completeness_weight)
SELECT p.id, g.id, true, m.weight, m.display_order, m.wizard, true, 1.0
FROM (VALUES
  ('professional-services', 'experience', 'default', 10, true),
  ('professional-services', 'languages-communication', 'heavy', 20, false),
  ('professional-services', 'equipment-tools', 'light', 30, false),
  ('professional-services', 'operational-requirements', 'default', 40, false),
  ('professional-services', 'service-area-travel', 'default', 50, false),
  ('professional-services', 'rates-booking', 'default', 60, false),
  ('professional-services', 'availability', 'default', 70, false),
  ('professional-services', 'trust-verification', 'heavy', 80, false),
  ('health-therapy', 'experience', 'default', 10, true),
  ('health-therapy', 'languages-communication', 'default', 20, false),
  ('health-therapy', 'operational-requirements', 'default', 30, false),
  ('health-therapy', 'service-area-travel', 'default', 40, false),
  ('health-therapy', 'rates-booking', 'default', 50, false),
  ('health-therapy', 'trust-verification', 'heavy', 60, false),
  ('education-tutoring', 'experience', 'default', 10, true),
  ('education-tutoring', 'media-portfolio', 'light', 20, false),
  ('education-tutoring', 'languages-communication', 'default', 30, false),
  ('education-tutoring', 'equipment-tools', 'light', 40, false),
  ('education-tutoring', 'operational-requirements', 'default', 50, false),
  ('education-tutoring', 'service-area-travel', 'default', 60, false),
  ('education-tutoring', 'rates-booking', 'default', 70, false),
  ('education-tutoring', 'availability', 'default', 80, false),
  ('education-tutoring', 'trust-verification', 'optional', 90, false),
  ('design-digital', 'media-portfolio', 'heavy', 10, true),
  ('design-digital', 'experience', 'default', 20, false),
  ('design-digital', 'equipment-tools', 'heavy', 30, false),
  ('design-digital', 'operational-requirements', 'default', 40, false),
  ('design-digital', 'rates-booking', 'default', 50, false),
  ('design-digital', 'availability', 'default', 60, false),
  ('crafts-makers', 'media-portfolio', 'heavy', 10, true),
  ('crafts-makers', 'experience', 'default', 20, false),
  ('crafts-makers', 'equipment-tools', 'default', 30, false),
  ('crafts-makers', 'operational-requirements', 'default', 40, false),
  ('crafts-makers', 'service-area-travel', 'default', 50, false),
  ('crafts-makers', 'rates-booking', 'default', 60, false),
  ('crafts-makers', 'availability', 'default', 70, false),
  ('pets-animal-care', 'experience', 'default', 10, true),
  ('pets-animal-care', 'equipment-tools', 'light', 20, false),
  ('pets-animal-care', 'operational-requirements', 'default', 30, false),
  ('pets-animal-care', 'service-area-travel', 'default', 40, false),
  ('pets-animal-care', 'rates-booking', 'default', 50, false),
  ('pets-animal-care', 'availability', 'default', 60, false),
  ('pets-animal-care', 'trust-verification', 'heavy', 70, false)
) AS m(parent_slug, group_slug, weight, display_order, wizard)
JOIN public.taxonomy_terms p
  ON p.slug = m.parent_slug AND p.term_type = 'parent_category'
JOIN public.profile_field_groups g ON g.slug = m.group_slug
ON CONFLICT (parent_category_id, field_group_id) DO NOTHING;

-- 4. Verification: any gap aborts (and rolls back) the whole migration --------
DO $$
DECLARE
  v_missing text;
BEGIN
  SELECT string_agg(t.field_key, ', ') INTO v_missing
  FROM _tx2a_fields t
  LEFT JOIN public.profile_field_definitions fd ON fd.field_key = t.field_key
  WHERE fd.id IS NULL OR fd.field_group_id IS NULL;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'taxonomy 2A: field definitions missing or without a field group: %', v_missing;
  END IF;

  SELECT string_agg(DISTINCT r.type_slug, ', ') INTO v_missing
  FROM _tx2a_recs r
  LEFT JOIN public.taxonomy_terms tt
    ON tt.slug = r.type_slug AND tt.term_type = 'talent_type'
  WHERE tt.id IS NULL;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'taxonomy 2A: talent_type terms missing (did 20261231298100 run first?): %', v_missing;
  END IF;

  SELECT string_agg(r.field_key || '@' || r.type_slug, ', ') INTO v_missing
  FROM _tx2a_recs r
  LEFT JOIN public.profile_field_definitions fd ON fd.field_key = r.field_key
  LEFT JOIN public.taxonomy_terms tt
    ON tt.slug = r.type_slug AND tt.term_type = 'talent_type'
  LEFT JOIN public.profile_field_recommendations pr
    ON pr.field_definition_id = fd.id AND pr.taxonomy_term_id = tt.id
   AND pr.relationship = 'recommended'
  WHERE pr.id IS NULL;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'taxonomy 2A: recommendations missing: %', v_missing;
  END IF;

  SELECT string_agg(m.parent_slug || '/' || m.group_slug, ', ') INTO v_missing
  FROM (VALUES
  ('professional-services', 'experience', 'default', 10, true),
  ('professional-services', 'languages-communication', 'heavy', 20, false),
  ('professional-services', 'equipment-tools', 'light', 30, false),
  ('professional-services', 'operational-requirements', 'default', 40, false),
  ('professional-services', 'service-area-travel', 'default', 50, false),
  ('professional-services', 'rates-booking', 'default', 60, false),
  ('professional-services', 'availability', 'default', 70, false),
  ('professional-services', 'trust-verification', 'heavy', 80, false),
  ('health-therapy', 'experience', 'default', 10, true),
  ('health-therapy', 'languages-communication', 'default', 20, false),
  ('health-therapy', 'operational-requirements', 'default', 30, false),
  ('health-therapy', 'service-area-travel', 'default', 40, false),
  ('health-therapy', 'rates-booking', 'default', 50, false),
  ('health-therapy', 'trust-verification', 'heavy', 60, false),
  ('education-tutoring', 'experience', 'default', 10, true),
  ('education-tutoring', 'media-portfolio', 'light', 20, false),
  ('education-tutoring', 'languages-communication', 'default', 30, false),
  ('education-tutoring', 'equipment-tools', 'light', 40, false),
  ('education-tutoring', 'operational-requirements', 'default', 50, false),
  ('education-tutoring', 'service-area-travel', 'default', 60, false),
  ('education-tutoring', 'rates-booking', 'default', 70, false),
  ('education-tutoring', 'availability', 'default', 80, false),
  ('education-tutoring', 'trust-verification', 'optional', 90, false),
  ('design-digital', 'media-portfolio', 'heavy', 10, true),
  ('design-digital', 'experience', 'default', 20, false),
  ('design-digital', 'equipment-tools', 'heavy', 30, false),
  ('design-digital', 'operational-requirements', 'default', 40, false),
  ('design-digital', 'rates-booking', 'default', 50, false),
  ('design-digital', 'availability', 'default', 60, false),
  ('crafts-makers', 'media-portfolio', 'heavy', 10, true),
  ('crafts-makers', 'experience', 'default', 20, false),
  ('crafts-makers', 'equipment-tools', 'default', 30, false),
  ('crafts-makers', 'operational-requirements', 'default', 40, false),
  ('crafts-makers', 'service-area-travel', 'default', 50, false),
  ('crafts-makers', 'rates-booking', 'default', 60, false),
  ('crafts-makers', 'availability', 'default', 70, false),
  ('pets-animal-care', 'experience', 'default', 10, true),
  ('pets-animal-care', 'equipment-tools', 'light', 20, false),
  ('pets-animal-care', 'operational-requirements', 'default', 30, false),
  ('pets-animal-care', 'service-area-travel', 'default', 40, false),
  ('pets-animal-care', 'rates-booking', 'default', 50, false),
  ('pets-animal-care', 'availability', 'default', 60, false),
  ('pets-animal-care', 'trust-verification', 'heavy', 70, false)
  ) AS m(parent_slug, group_slug, weight, display_order, wizard)
  LEFT JOIN public.taxonomy_terms p
    ON p.slug = m.parent_slug AND p.term_type = 'parent_category'
  LEFT JOIN public.profile_field_groups g ON g.slug = m.group_slug
  LEFT JOIN public.parent_category_field_groups pg
    ON pg.parent_category_id = p.id AND pg.field_group_id = g.id
  WHERE pg.parent_category_id IS NULL;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'taxonomy 2A: parent_category_field_groups rows missing: %', v_missing;
  END IF;
END $$;

DROP TABLE _tx2a_recs;
DROP TABLE _tx2a_fields;

COMMIT;
