-- Taxonomy v2 — seed step 5: skills + contexts.
--
-- Skills (level 2 under skill_groups, level 3 under groups). The full V1
-- spec lists ~110 skills across 9 groups. We seed all of them as canonical
-- terms (kind='skill', term_type='skill') under skill_groups (kind='tag',
-- term_type='skill_group').
--
-- Contexts (level 2 under context_group). Contexts describe WHERE the talent
-- works (event environments, venue types). Used as relationship_type='context'
-- on talent profiles.
--
-- Skills and contexts are NOT Talent Types — a person is not booked AS
-- "Public Speaking" or AS "Beach Clubs". They refine a Talent Type assignment.

BEGIN;

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

-- ─── 9 skill_groups (level 1, top-level under no parent) ──────────────────
INSERT INTO public.taxonomy_terms
  (id, kind, term_type, level, slug, name_en, name_es, sort_order, is_active, is_profile_badge, parent_id)
VALUES
  (public.taxv1_uuid('skill_group','sales-promotion'),       'tag','skill_group',1,'sales-promotion',       'Sales & Promotion',           'Ventas y Promoción',          10, TRUE, FALSE, NULL),
  (public.taxv1_uuid('skill_group','communication'),         'tag','skill_group',1,'communication',         'Communication',               'Comunicación',                20, TRUE, FALSE, NULL),
  (public.taxv1_uuid('skill_group','finance-business'),      'tag','skill_group',1,'finance-business',      'Finance & Business',          'Finanzas y Negocios',         30, TRUE, FALSE, NULL),
  (public.taxv1_uuid('skill_group','customer-service-vip'),  'tag','skill_group',1,'customer-service-vip',  'Customer Service & VIP Handling','Servicio al Cliente y VIP', 40, TRUE, FALSE, NULL),
  (public.taxv1_uuid('skill_group','leadership-operations'), 'tag','skill_group',1,'leadership-operations', 'Leadership & Operations',     'Liderazgo y Operaciones',     50, TRUE, FALSE, NULL),
  (public.taxv1_uuid('skill_group','creative-skills'),       'tag','skill_group',1,'creative-skills',       'Creative Skills',             'Habilidades Creativas',       60, TRUE, FALSE, NULL),
  (public.taxv1_uuid('skill_group','technical-skills'),      'tag','skill_group',1,'technical-skills',      'Technical Skills',            'Habilidades Técnicas',        70, TRUE, FALSE, NULL),
  (public.taxv1_uuid('skill_group','physical-performance'),  'tag','skill_group',1,'physical-performance',  'Physical / Performance Skills','Habilidades Físicas',        80, TRUE, FALSE, NULL),
  (public.taxv1_uuid('skill_group','hospitality-skills'),    'tag','skill_group',1,'hospitality-skills',    'Hospitality Skills',          'Habilidades de Hospitalidad', 90, TRUE, FALSE, NULL)
ON CONFLICT (term_type, slug) DO UPDATE SET
  name_en = EXCLUDED.name_en, name_es = EXCLUDED.name_es,
  level = EXCLUDED.level, sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active, is_profile_badge = EXCLUDED.is_profile_badge,
  parent_id = EXCLUDED.parent_id, updated_at = now();

-- ─── Skills (level 2, parent=skill_group). kind='skill' so they slot into
--     the existing kind='skill' index without colliding with kind='tag'. ──
INSERT INTO public.taxonomy_terms
  (id, kind, term_type, level, slug, name_en, name_es, sort_order, is_active, is_profile_badge, parent_id)
VALUES
  -- Sales & Promotion
  (public.taxv1_uuid('skill','product-sales'),               'skill','skill',2,'product-sales',               'Product Sales',          'Venta de Productos',     10, TRUE, TRUE, public.taxv1_uuid('skill_group','sales-promotion')),
  (public.taxv1_uuid('skill','upselling'),                   'skill','skill',2,'upselling',                   'Upselling',              'Upselling',              20, TRUE, TRUE, public.taxv1_uuid('skill_group','sales-promotion')),
  (public.taxv1_uuid('skill','lead-generation'),             'skill','skill',2,'lead-generation',             'Lead Generation',        'Generación de Leads',    30, TRUE, TRUE, public.taxv1_uuid('skill_group','sales-promotion')),
  (public.taxv1_uuid('skill','closing-deals'),               'skill','skill',2,'closing-deals',               'Closing Deals',          'Cierre de Ventas',       40, TRUE, TRUE, public.taxv1_uuid('skill_group','sales-promotion')),
  (public.taxv1_uuid('skill','customer-acquisition'),        'skill','skill',2,'customer-acquisition',        'Customer Acquisition',   'Adquisición de Clientes',50, TRUE, TRUE, public.taxv1_uuid('skill_group','sales-promotion')),
  (public.taxv1_uuid('skill','brand-promotion'),             'skill','skill',2,'brand-promotion',             'Brand Promotion',        'Promoción de Marca',     60, TRUE, TRUE, public.taxv1_uuid('skill_group','sales-promotion')),
  (public.taxv1_uuid('skill','sampling-product-demos'),      'skill','skill',2,'sampling-product-demos',      'Sampling / Product Demos','Muestras / Demos',      70, TRUE, TRUE, public.taxv1_uuid('skill_group','sales-promotion')),
  (public.taxv1_uuid('skill','trade-show-sales'),            'skill','skill',2,'trade-show-sales',            'Trade Show Sales',       'Ventas en Expo',         80, TRUE, TRUE, public.taxv1_uuid('skill_group','sales-promotion')),
  (public.taxv1_uuid('skill','retail-sales'),                'skill','skill',2,'retail-sales',                'Retail Sales',           'Ventas Retail',          90, TRUE, TRUE, public.taxv1_uuid('skill_group','sales-promotion')),
  (public.taxv1_uuid('skill','luxury-sales'),                'skill','skill',2,'luxury-sales',                'Luxury Sales',           'Ventas de Lujo',         100,TRUE, TRUE, public.taxv1_uuid('skill_group','sales-promotion')),
  (public.taxv1_uuid('skill','real-estate-sales'),           'skill','skill',2,'real-estate-sales',           'Real Estate Sales',      'Ventas Inmobiliarias',   110,TRUE, TRUE, public.taxv1_uuid('skill_group','sales-promotion')),
  (public.taxv1_uuid('skill','nightlife-table-sales'),       'skill','skill',2,'nightlife-table-sales',       'Nightlife Table Sales',  'Ventas de Mesas',        120,TRUE, TRUE, public.taxv1_uuid('skill_group','sales-promotion')),
  (public.taxv1_uuid('skill','membership-sales'),            'skill','skill',2,'membership-sales',            'Membership Sales',       'Ventas de Membresías',   130,TRUE, TRUE, public.taxv1_uuid('skill_group','sales-promotion')),
  (public.taxv1_uuid('skill','sponsorship-sales'),           'skill','skill',2,'sponsorship-sales',           'Sponsorship Sales',      'Ventas de Patrocinios',  140,TRUE, TRUE, public.taxv1_uuid('skill_group','sales-promotion')),

  -- Communication
  (public.taxv1_uuid('skill','public-speaking'),             'skill','skill',2,'public-speaking',             'Public Speaking',        'Oratoria',               10, TRUE, TRUE, public.taxv1_uuid('skill_group','communication')),
  (public.taxv1_uuid('skill','guest-interaction'),           'skill','skill',2,'guest-interaction',           'Guest Interaction',      'Interacción con Invitados',20,TRUE,TRUE, public.taxv1_uuid('skill_group','communication')),
  (public.taxv1_uuid('skill','storytelling'),                'skill','skill',2,'storytelling',                'Storytelling',           'Storytelling',           30, TRUE, TRUE, public.taxv1_uuid('skill_group','communication')),
  (public.taxv1_uuid('skill','negotiation'),                 'skill','skill',2,'negotiation',                 'Negotiation',            'Negociación',            40, TRUE, TRUE, public.taxv1_uuid('skill_group','communication')),
  (public.taxv1_uuid('skill','conflict-resolution'),         'skill','skill',2,'conflict-resolution',         'Conflict Resolution',    'Resolución de Conflictos',50,TRUE,TRUE, public.taxv1_uuid('skill_group','communication')),
  (public.taxv1_uuid('skill','client-follow-up'),            'skill','skill',2,'client-follow-up',            'Client Follow-Up',       'Seguimiento de Clientes',60, TRUE, TRUE, public.taxv1_uuid('skill_group','communication')),
  (public.taxv1_uuid('skill','phone-communication'),         'skill','skill',2,'phone-communication',         'Phone Communication',    'Comunicación Telefónica',70, TRUE, TRUE, public.taxv1_uuid('skill_group','communication')),
  (public.taxv1_uuid('skill','presentation-skills'),         'skill','skill',2,'presentation-skills',         'Presentation Skills',    'Presentaciones',         80, TRUE, TRUE, public.taxv1_uuid('skill_group','communication')),

  -- Finance & Business
  (public.taxv1_uuid('skill','cash-handling'),               'skill','skill',2,'cash-handling',               'Cash Handling',          'Manejo de Efectivo',     10, TRUE, TRUE, public.taxv1_uuid('skill_group','finance-business')),
  (public.taxv1_uuid('skill','payment-processing'),          'skill','skill',2,'payment-processing',          'Payment Processing',     'Procesamiento de Pagos', 20, TRUE, TRUE, public.taxv1_uuid('skill_group','finance-business')),
  (public.taxv1_uuid('skill','budget-management'),           'skill','skill',2,'budget-management',           'Budget Management',      'Manejo de Presupuesto',  30, TRUE, TRUE, public.taxv1_uuid('skill_group','finance-business')),
  (public.taxv1_uuid('skill','basic-accounting'),            'skill','skill',2,'basic-accounting',            'Basic Accounting',       'Contabilidad Básica',    40, TRUE, TRUE, public.taxv1_uuid('skill_group','finance-business')),
  (public.taxv1_uuid('skill','invoicing'),                   'skill','skill',2,'invoicing',                   'Invoicing',              'Facturación',            50, TRUE, TRUE, public.taxv1_uuid('skill_group','finance-business')),
  (public.taxv1_uuid('skill','financial-reporting'),         'skill','skill',2,'financial-reporting',         'Financial Reporting',    'Reportes Financieros',   60, TRUE, TRUE, public.taxv1_uuid('skill_group','finance-business')),
  (public.taxv1_uuid('skill','sales-reporting'),             'skill','skill',2,'sales-reporting',             'Sales Reporting',        'Reportes de Ventas',     70, TRUE, TRUE, public.taxv1_uuid('skill_group','finance-business')),
  (public.taxv1_uuid('skill','commission-tracking'),         'skill','skill',2,'commission-tracking',         'Commission Tracking',    'Seguimiento de Comisiones',80,TRUE,TRUE, public.taxv1_uuid('skill_group','finance-business')),
  (public.taxv1_uuid('skill','business-development'),        'skill','skill',2,'business-development',        'Business Development',   'Desarrollo de Negocios', 90, TRUE, TRUE, public.taxv1_uuid('skill_group','finance-business')),
  (public.taxv1_uuid('skill','vendor-negotiation'),          'skill','skill',2,'vendor-negotiation',          'Vendor Negotiation',     'Negociación con Proveedores',100,TRUE,TRUE, public.taxv1_uuid('skill_group','finance-business')),
  (public.taxv1_uuid('skill','client-account-management'),   'skill','skill',2,'client-account-management',   'Client Account Management','Manejo de Cuentas',     110,TRUE, TRUE, public.taxv1_uuid('skill_group','finance-business')),
  (public.taxv1_uuid('skill','real-estate-knowledge'),       'skill','skill',2,'real-estate-knowledge',       'Real Estate Knowledge',  'Conocimiento Inmobiliario',120,TRUE,TRUE, public.taxv1_uuid('skill_group','finance-business')),
  (public.taxv1_uuid('skill','investment-knowledge'),        'skill','skill',2,'investment-knowledge',        'Investment Knowledge',   'Conocimiento de Inversiones',130,TRUE,TRUE, public.taxv1_uuid('skill_group','finance-business')),
  (public.taxv1_uuid('skill','insurance-knowledge'),         'skill','skill',2,'insurance-knowledge',         'Insurance Knowledge',    'Conocimiento de Seguros',140,TRUE, TRUE, public.taxv1_uuid('skill_group','finance-business')),
  (public.taxv1_uuid('skill','luxury-client-management'),    'skill','skill',2,'luxury-client-management',    'Luxury Client Management','Manejo de Clientes de Lujo',150,TRUE,TRUE, public.taxv1_uuid('skill_group','finance-business')),

  -- Customer Service & VIP
  (public.taxv1_uuid('skill','vip-guest-service'),           'skill','skill',2,'vip-guest-service',           'VIP Guest Service',      'Servicio VIP',           10, TRUE, TRUE, public.taxv1_uuid('skill_group','customer-service-vip')),
  (public.taxv1_uuid('skill','concierge-level-service'),     'skill','skill',2,'concierge-level-service',     'Concierge-Level Service','Servicio Concierge',     20, TRUE, TRUE, public.taxv1_uuid('skill_group','customer-service-vip')),
  (public.taxv1_uuid('skill','complaint-handling'),          'skill','skill',2,'complaint-handling',          'Complaint Handling',     'Manejo de Quejas',       30, TRUE, TRUE, public.taxv1_uuid('skill_group','customer-service-vip')),
  (public.taxv1_uuid('skill','high-net-worth-experience'),   'skill','skill',2,'high-net-worth-experience',   'High-Net-Worth Client Experience','Experiencia con Alto Valor Neto',40,TRUE,TRUE, public.taxv1_uuid('skill_group','customer-service-vip')),
  (public.taxv1_uuid('skill','luxury-hospitality'),          'skill','skill',2,'luxury-hospitality',          'Luxury Hospitality',     'Hospitalidad de Lujo',   50, TRUE, TRUE, public.taxv1_uuid('skill_group','customer-service-vip')),
  (public.taxv1_uuid('skill','discretion-privacy'),          'skill','skill',2,'discretion-privacy',          'Discretion & Privacy',   'Discreción y Privacidad',60, TRUE, TRUE, public.taxv1_uuid('skill_group','customer-service-vip')),
  (public.taxv1_uuid('skill','client-retention'),            'skill','skill',2,'client-retention',            'Client Retention',       'Retención de Clientes',  70, TRUE, TRUE, public.taxv1_uuid('skill_group','customer-service-vip')),
  (public.taxv1_uuid('skill','guest-check-in'),              'skill','skill',2,'guest-check-in',              'Guest Check-In',         'Check-In de Invitados',  80, TRUE, TRUE, public.taxv1_uuid('skill_group','customer-service-vip')),
  (public.taxv1_uuid('skill','guest-follow-up'),             'skill','skill',2,'guest-follow-up',             'Guest Follow-Up',        'Seguimiento de Invitados',90,TRUE, TRUE, public.taxv1_uuid('skill_group','customer-service-vip')),
  (public.taxv1_uuid('skill','reservation-handling'),        'skill','skill',2,'reservation-handling',        'Reservation Handling',   'Manejo de Reservas',     100,TRUE, TRUE, public.taxv1_uuid('skill_group','customer-service-vip')),

  -- Leadership & Operations
  (public.taxv1_uuid('skill','team-leadership'),             'skill','skill',2,'team-leadership',             'Team Leadership',        'Liderazgo de Equipos',   10, TRUE, TRUE, public.taxv1_uuid('skill_group','leadership-operations')),
  (public.taxv1_uuid('skill','event-coordination'),          'skill','skill',2,'event-coordination',          'Event Coordination',     'Coordinación de Eventos',20, TRUE, TRUE, public.taxv1_uuid('skill_group','leadership-operations')),
  (public.taxv1_uuid('skill','staff-supervision'),           'skill','skill',2,'staff-supervision',           'Staff Supervision',      'Supervisión de Personal',30, TRUE, TRUE, public.taxv1_uuid('skill_group','leadership-operations')),
  (public.taxv1_uuid('skill','scheduling'),                  'skill','skill',2,'scheduling',                  'Scheduling',             'Programación',           40, TRUE, TRUE, public.taxv1_uuid('skill_group','leadership-operations')),
  (public.taxv1_uuid('skill','logistics'),                   'skill','skill',2,'logistics',                   'Logistics',              'Logística',              50, TRUE, TRUE, public.taxv1_uuid('skill_group','leadership-operations')),
  (public.taxv1_uuid('skill','inventory-control'),           'skill','skill',2,'inventory-control',           'Inventory Control',      'Control de Inventario',  60, TRUE, TRUE, public.taxv1_uuid('skill_group','leadership-operations')),
  (public.taxv1_uuid('skill','vendor-management'),           'skill','skill',2,'vendor-management',           'Vendor Management',      'Manejo de Proveedores',  70, TRUE, TRUE, public.taxv1_uuid('skill_group','leadership-operations')),
  (public.taxv1_uuid('skill','problem-solving'),             'skill','skill',2,'problem-solving',             'Problem Solving',        'Resolución de Problemas',80, TRUE, TRUE, public.taxv1_uuid('skill_group','leadership-operations')),
  (public.taxv1_uuid('skill','crisis-management'),           'skill','skill',2,'crisis-management',           'Crisis Management',      'Manejo de Crisis',       90, TRUE, TRUE, public.taxv1_uuid('skill_group','leadership-operations')),
  (public.taxv1_uuid('skill','on-site-decision-making'),     'skill','skill',2,'on-site-decision-making',     'On-Site Decision Making','Decisiones en Sitio',    100,TRUE, TRUE, public.taxv1_uuid('skill_group','leadership-operations')),
  (public.taxv1_uuid('skill','training-new-staff'),          'skill','skill',2,'training-new-staff',          'Training New Staff',     'Capacitación de Personal',110,TRUE,TRUE, public.taxv1_uuid('skill_group','leadership-operations')),

  -- Creative
  (public.taxv1_uuid('skill','content-creation'),            'skill','skill',2,'content-creation',            'Content Creation',       'Creación de Contenido',  10, TRUE, TRUE, public.taxv1_uuid('skill_group','creative-skills')),
  (public.taxv1_uuid('skill','social-media'),                'skill','skill',2,'social-media',                'Social Media',           'Redes Sociales',         20, TRUE, TRUE, public.taxv1_uuid('skill_group','creative-skills')),
  (public.taxv1_uuid('skill','photography-basics'),          'skill','skill',2,'photography-basics',          'Photography Basics',     'Fotografía Básica',      30, TRUE, TRUE, public.taxv1_uuid('skill_group','creative-skills')),
  (public.taxv1_uuid('skill','video-basics'),                'skill','skill',2,'video-basics',                'Video Basics',           'Video Básico',           40, TRUE, TRUE, public.taxv1_uuid('skill_group','creative-skills')),
  (public.taxv1_uuid('skill','styling-skill'),               'skill','skill',2,'styling-skill',               'Styling',                'Estilismo',              50, TRUE, TRUE, public.taxv1_uuid('skill_group','creative-skills')),
  (public.taxv1_uuid('skill','makeup-basics'),               'skill','skill',2,'makeup-basics',               'Makeup Basics',          'Maquillaje Básico',      60, TRUE, TRUE, public.taxv1_uuid('skill_group','creative-skills')),
  (public.taxv1_uuid('skill','fashion-direction'),           'skill','skill',2,'fashion-direction',           'Fashion Direction',      'Dirección de Moda',      70, TRUE, TRUE, public.taxv1_uuid('skill_group','creative-skills')),
  (public.taxv1_uuid('skill','brand-storytelling'),          'skill','skill',2,'brand-storytelling',          'Brand Storytelling',     'Storytelling de Marca',  80, TRUE, TRUE, public.taxv1_uuid('skill_group','creative-skills')),
  (public.taxv1_uuid('skill','copywriting'),                 'skill','skill',2,'copywriting',                 'Copywriting',            'Copywriting',            90, TRUE, TRUE, public.taxv1_uuid('skill_group','creative-skills')),
  (public.taxv1_uuid('skill','script-reading'),              'skill','skill',2,'script-reading',              'Script Reading',         'Lectura de Guión',       100,TRUE, TRUE, public.taxv1_uuid('skill_group','creative-skills')),
  (public.taxv1_uuid('skill','posing-direction'),            'skill','skill',2,'posing-direction',            'Posing Direction',       'Dirección de Pose',      110,TRUE, TRUE, public.taxv1_uuid('skill_group','creative-skills')),

  -- Technical
  (public.taxv1_uuid('skill','audio-setup'),                 'skill','skill',2,'audio-setup',                 'Audio Setup',            'Setup de Audio',         10, TRUE, TRUE, public.taxv1_uuid('skill_group','technical-skills')),
  (public.taxv1_uuid('skill','lighting-setup'),              'skill','skill',2,'lighting-setup',              'Lighting Setup',         'Setup de Iluminación',   20, TRUE, TRUE, public.taxv1_uuid('skill_group','technical-skills')),
  (public.taxv1_uuid('skill','av-equipment'),                'skill','skill',2,'av-equipment',                'AV Equipment',           'Equipo AV',              30, TRUE, TRUE, public.taxv1_uuid('skill_group','technical-skills')),
  (public.taxv1_uuid('skill','camera-operation'),            'skill','skill',2,'camera-operation',            'Camera Operation',       'Operación de Cámara',    40, TRUE, TRUE, public.taxv1_uuid('skill_group','technical-skills')),
  (public.taxv1_uuid('skill','drone-operation'),             'skill','skill',2,'drone-operation',             'Drone Operation',        'Operación de Drones',    50, TRUE, TRUE, public.taxv1_uuid('skill_group','technical-skills')),
  (public.taxv1_uuid('skill','pos-system'),                  'skill','skill',2,'pos-system',                  'POS System',             'Sistema POS',            60, TRUE, TRUE, public.taxv1_uuid('skill_group','technical-skills')),
  (public.taxv1_uuid('skill','crm-software'),                'skill','skill',2,'crm-software',                'CRM Software',           'Software CRM',           70, TRUE, TRUE, public.taxv1_uuid('skill_group','technical-skills')),
  (public.taxv1_uuid('skill','booking-software'),            'skill','skill',2,'booking-software',            'Booking Software',       'Software de Reservas',   80, TRUE, TRUE, public.taxv1_uuid('skill_group','technical-skills')),
  (public.taxv1_uuid('skill','google-sheets-excel'),         'skill','skill',2,'google-sheets-excel',         'Google Sheets / Excel',  'Google Sheets / Excel',  90, TRUE, TRUE, public.taxv1_uuid('skill_group','technical-skills')),
  (public.taxv1_uuid('skill','social-media-tools'),          'skill','skill',2,'social-media-tools',          'Social Media Tools',     'Herramientas de Redes',  100,TRUE, TRUE, public.taxv1_uuid('skill_group','technical-skills')),
  (public.taxv1_uuid('skill','canva-skill'),                 'skill','skill',2,'canva-skill',                 'Canva',                  'Canva',                  110,TRUE, TRUE, public.taxv1_uuid('skill_group','technical-skills')),
  (public.taxv1_uuid('skill','basic-website-editing'),       'skill','skill',2,'basic-website-editing',       'Basic Website Editing',  'Edición Web Básica',     120,TRUE, TRUE, public.taxv1_uuid('skill_group','technical-skills')),

  -- Physical / Performance
  (public.taxv1_uuid('skill','dancing-skill'),               'skill','skill',2,'dancing-skill',               'Dancing',                'Baile',                  10, TRUE, TRUE, public.taxv1_uuid('skill_group','physical-performance')),
  (public.taxv1_uuid('skill','singing-skill'),               'skill','skill',2,'singing-skill',               'Singing',                'Canto',                  20, TRUE, TRUE, public.taxv1_uuid('skill_group','physical-performance')),
  (public.taxv1_uuid('skill','acting-skill'),                'skill','skill',2,'acting-skill',                'Acting',                 'Actuación',              30, TRUE, TRUE, public.taxv1_uuid('skill_group','physical-performance')),
  (public.taxv1_uuid('skill','improvisation'),               'skill','skill',2,'improvisation',               'Improvisation',          'Improvisación',          40, TRUE, TRUE, public.taxv1_uuid('skill_group','physical-performance')),
  (public.taxv1_uuid('skill','choreography'),                'skill','skill',2,'choreography',                'Choreography',           'Coreografía',            50, TRUE, TRUE, public.taxv1_uuid('skill_group','physical-performance')),
  (public.taxv1_uuid('skill','fitness-skill'),               'skill','skill',2,'fitness-skill',               'Fitness',                'Fitness',                60, TRUE, TRUE, public.taxv1_uuid('skill_group','physical-performance')),
  (public.taxv1_uuid('skill','flexibility'),                 'skill','skill',2,'flexibility',                 'Flexibility',            'Flexibilidad',           70, TRUE, TRUE, public.taxv1_uuid('skill_group','physical-performance')),
  (public.taxv1_uuid('skill','acrobatics'),                  'skill','skill',2,'acrobatics',                  'Acrobatics',             'Acrobacia',              80, TRUE, TRUE, public.taxv1_uuid('skill_group','physical-performance')),
  (public.taxv1_uuid('skill','stage-presence'),              'skill','skill',2,'stage-presence',              'Stage Presence',         'Presencia Escénica',     90, TRUE, TRUE, public.taxv1_uuid('skill_group','physical-performance')),
  (public.taxv1_uuid('skill','runway-walk'),                 'skill','skill',2,'runway-walk',                 'Runway Walk',            'Pasarela',               100,TRUE, TRUE, public.taxv1_uuid('skill_group','physical-performance')),
  (public.taxv1_uuid('skill','posing-skill'),                'skill','skill',2,'posing-skill',                'Posing',                 'Pose',                   110,TRUE, TRUE, public.taxv1_uuid('skill_group','physical-performance')),
  (public.taxv1_uuid('skill','endurance'),                   'skill','skill',2,'endurance',                   'Endurance',              'Resistencia',            120,TRUE, TRUE, public.taxv1_uuid('skill_group','physical-performance')),
  (public.taxv1_uuid('skill','fire-performance'),            'skill','skill',2,'fire-performance',            'Fire Performance',       'Performance de Fuego',   130,TRUE, TRUE, public.taxv1_uuid('skill_group','physical-performance')),

  -- Hospitality
  (public.taxv1_uuid('skill','table-service'),               'skill','skill',2,'table-service',               'Table Service',          'Servicio en Mesa',       10, TRUE, TRUE, public.taxv1_uuid('skill_group','hospitality-skills')),
  (public.taxv1_uuid('skill','guest-greeting'),              'skill','skill',2,'guest-greeting',              'Guest Greeting',         'Recepción de Invitados', 20, TRUE, TRUE, public.taxv1_uuid('skill_group','hospitality-skills')),
  (public.taxv1_uuid('skill','reservation-handling-hosp'),   'skill','skill',2,'reservation-handling-hosp',   'Reservation Handling (Hosp.)','Manejo de Reservas',30, TRUE, TRUE, public.taxv1_uuid('skill_group','hospitality-skills')),
  (public.taxv1_uuid('skill','room-turnover'),               'skill','skill',2,'room-turnover',               'Room Turnover',          'Cambio de Habitaciones', 40, TRUE, TRUE, public.taxv1_uuid('skill_group','hospitality-skills')),
  (public.taxv1_uuid('skill','villa-service'),               'skill','skill',2,'villa-service',               'Villa Service',          'Servicio de Villa',      50, TRUE, TRUE, public.taxv1_uuid('skill_group','hospitality-skills')),
  (public.taxv1_uuid('skill','butler-style-service'),        'skill','skill',2,'butler-style-service',        'Butler-Style Service',   'Servicio Estilo Mayordomo',60,TRUE,TRUE, public.taxv1_uuid('skill_group','hospitality-skills')),
  (public.taxv1_uuid('skill','food-beverage-service'),       'skill','skill',2,'food-beverage-service',       'Food & Beverage Service','Servicio F&B',           70, TRUE, TRUE, public.taxv1_uuid('skill_group','hospitality-skills')),
  (public.taxv1_uuid('skill','wine-service'),                'skill','skill',2,'wine-service',                'Wine Service',           'Servicio de Vino',       80, TRUE, TRUE, public.taxv1_uuid('skill_group','hospitality-skills')),
  (public.taxv1_uuid('skill','luxury-etiquette'),            'skill','skill',2,'luxury-etiquette',            'Luxury Etiquette',       'Etiqueta de Lujo',       90, TRUE, TRUE, public.taxv1_uuid('skill_group','hospitality-skills'))
ON CONFLICT (term_type, slug) DO UPDATE SET
  name_en = EXCLUDED.name_en, name_es = EXCLUDED.name_es,
  level = EXCLUDED.level, sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active, is_profile_badge = EXCLUDED.is_profile_badge,
  parent_id = EXCLUDED.parent_id, updated_at = now();

-- Reattach legacy generic skill rows to the right skill_group.
UPDATE public.taxonomy_terms SET parent_id = public.taxv1_uuid('skill_group','communication'),        level = 2 WHERE kind::text = 'skill' AND slug = 'hosting';
UPDATE public.taxonomy_terms SET parent_id = public.taxv1_uuid('skill_group','physical-performance'), level = 2 WHERE kind::text = 'skill' AND slug = 'modeling';

-- ─── 1 context_group + ~25 contexts (level 2) ────────────────────────────
INSERT INTO public.taxonomy_terms
  (id, kind, term_type, level, slug, name_en, name_es, sort_order, is_active, is_profile_badge, parent_id)
VALUES
  (public.taxv1_uuid('context_group','service-contexts'),   'tag','context_group',1,'service-contexts',   'Service Contexts',     'Contextos de Servicio',  10, TRUE, FALSE, NULL),

  (public.taxv1_uuid('context','luxury-events'),            'event_type','context',2,'luxury-events',            'Luxury Events',        'Eventos de Lujo',        10, TRUE, TRUE, public.taxv1_uuid('context_group','service-contexts')),
  (public.taxv1_uuid('context','private-parties'),          'event_type','context',2,'private-parties',          'Private Parties',      'Fiestas Privadas',       20, TRUE, TRUE, public.taxv1_uuid('context_group','service-contexts')),
  (public.taxv1_uuid('context','weddings'),                 'event_type','context',2,'weddings',                 'Weddings',             'Bodas',                  30, TRUE, TRUE, public.taxv1_uuid('context_group','service-contexts')),
  (public.taxv1_uuid('context','corporate-events'),         'event_type','context',2,'corporate-events',         'Corporate Events',     'Eventos Corporativos',   40, TRUE, TRUE, public.taxv1_uuid('context_group','service-contexts')),
  (public.taxv1_uuid('context','brand-activations'),        'event_type','context',2,'brand-activations',        'Brand Activations',    'Activaciones de Marca',  50, TRUE, TRUE, public.taxv1_uuid('context_group','service-contexts')),
  (public.taxv1_uuid('context','trade-shows'),              'event_type','context',2,'trade-shows',              'Trade Shows',          'Expos',                  60, TRUE, TRUE, public.taxv1_uuid('context_group','service-contexts')),
  (public.taxv1_uuid('context','fashion-shows'),            'event_type','context',2,'fashion-shows',            'Fashion Shows',        'Pasarelas',              70, TRUE, TRUE, public.taxv1_uuid('context_group','service-contexts')),
  (public.taxv1_uuid('context','photo-shoots'),             'event_type','context',2,'photo-shoots',             'Photo Shoots',         'Sesiones Fotográficas',  80, TRUE, TRUE, public.taxv1_uuid('context_group','service-contexts')),
  (public.taxv1_uuid('context','video-shoots'),             'event_type','context',2,'video-shoots',             'Video Shoots',         'Sesiones de Video',      90, TRUE, TRUE, public.taxv1_uuid('context_group','service-contexts')),
  (public.taxv1_uuid('context','hotels'),                   'event_type','context',2,'hotels',                   'Hotels',               'Hoteles',                100,TRUE, TRUE, public.taxv1_uuid('context_group','service-contexts')),
  (public.taxv1_uuid('context','resorts'),                  'event_type','context',2,'resorts',                  'Resorts',              'Resorts',                110,TRUE, TRUE, public.taxv1_uuid('context_group','service-contexts')),
  (public.taxv1_uuid('context','restaurants'),              'event_type','context',2,'restaurants',              'Restaurants',          'Restaurantes',           120,TRUE, TRUE, public.taxv1_uuid('context_group','service-contexts')),
  (public.taxv1_uuid('context','beach-clubs'),              'event_type','context',2,'beach-clubs',              'Beach Clubs',          'Beach Clubs',            130,TRUE, TRUE, public.taxv1_uuid('context_group','service-contexts')),
  (public.taxv1_uuid('context','nightclubs'),               'event_type','context',2,'nightclubs',               'Nightclubs',           'Discotecas',             140,TRUE, TRUE, public.taxv1_uuid('context_group','service-contexts')),
  (public.taxv1_uuid('context','private-villas'),           'event_type','context',2,'private-villas',           'Private Villas',       'Villas Privadas',        150,TRUE, TRUE, public.taxv1_uuid('context_group','service-contexts')),
  (public.taxv1_uuid('context','yachts'),                   'event_type','context',2,'yachts',                   'Yachts',               'Yates',                  160,TRUE, TRUE, public.taxv1_uuid('context_group','service-contexts')),
  (public.taxv1_uuid('context','boats'),                    'event_type','context',2,'boats',                    'Boats',                'Embarcaciones',          170,TRUE, TRUE, public.taxv1_uuid('context_group','service-contexts')),
  (public.taxv1_uuid('context','airbnbs'),                  'event_type','context',2,'airbnbs',                  'Airbnbs',              'Airbnbs',                180,TRUE, TRUE, public.taxv1_uuid('context_group','service-contexts')),
  (public.taxv1_uuid('context','real-estate-events'),       'event_type','context',2,'real-estate-events',       'Real Estate Events',   'Eventos Inmobiliarios',  190,TRUE, TRUE, public.taxv1_uuid('context_group','service-contexts')),
  (public.taxv1_uuid('context','wellness-retreats'),        'event_type','context',2,'wellness-retreats',        'Wellness Retreats',    'Retiros de Bienestar',   200,TRUE, TRUE, public.taxv1_uuid('context_group','service-contexts')),
  (public.taxv1_uuid('context','family-travel'),            'event_type','context',2,'family-travel',            'Family Travel',        'Viajes Familiares',      210,TRUE, TRUE, public.taxv1_uuid('context_group','service-contexts')),
  (public.taxv1_uuid('context','kids-events'),              'event_type','context',2,'kids-events',              'Kids Events',          'Eventos Infantiles',     220,TRUE, TRUE, public.taxv1_uuid('context_group','service-contexts')),
  (public.taxv1_uuid('context','conferences'),              'event_type','context',2,'conferences',              'Conferences',          'Conferencias',           230,TRUE, TRUE, public.taxv1_uuid('context_group','service-contexts')),
  (public.taxv1_uuid('context','product-launches'),         'event_type','context',2,'product-launches',         'Product Launches',     'Lanzamientos',           240,TRUE, TRUE, public.taxv1_uuid('context_group','service-contexts')),
  (public.taxv1_uuid('context','vip-experiences'),          'event_type','context',2,'vip-experiences',          'VIP Experiences',      'Experiencias VIP',       250,TRUE, TRUE, public.taxv1_uuid('context_group','service-contexts')),
  (public.taxv1_uuid('context','tourism-experiences'),      'event_type','context',2,'tourism-experiences',      'Tourism Experiences',  'Experiencias Turísticas',260,TRUE, TRUE, public.taxv1_uuid('context_group','service-contexts'))
ON CONFLICT (term_type, slug) DO UPDATE SET
  name_en = EXCLUDED.name_en, name_es = EXCLUDED.name_es,
  level = EXCLUDED.level, sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active, is_profile_badge = EXCLUDED.is_profile_badge,
  parent_id = EXCLUDED.parent_id, updated_at = now();

COMMIT;
