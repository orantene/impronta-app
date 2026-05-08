-- ============================================================================
-- Taxonomy Cleanup V1 — 2026-05-07
-- ============================================================================
--
-- WHY
-- ───
-- The master taxonomy in `taxonomy_terms` was seeded with ~425 talent_types
-- across 75 sub-types and 19 parent_categories. Review revealed:
--
--   • Several role+context combos seeded as standalone talent_types
--     (Wedding DJ, Corporate DJ, Wedding Singer, Wedding Photographer, …)
--     when they should be `bare role + existing context`.
--   • Massage styles seeded as talent_types (Deep Tissue Massage, …) when
--     they should be specialties under Massage Therapist.
--   • Duplicate / spelling-variant context rows (Convention vs Conventions,
--     Corporate vs Corporate Event vs Corporate Events, Yachting vs Yachts).
--   • Generic fallback names (DJ, Singer, Model, Hostess, …) competing with
--     specific talent_types in the picker.
--   • Cross-parent placement bugs (Athlete Talent under Performers; Personal
--     Trainer canonical under Wellness, not Sports & Fitness).
--   • Bilingual Presenter as a talent_type — bilingual is a language
--     capability, not a role.
--   • Animals & Specialty Acts visible alongside Models in the default
--     picker — too fringe for most agencies to surface by default.
--
-- WHAT
-- ────
-- ARCHIVED (soft, is_active=false; preserved for history) — 20 terms:
--   • Variant contexts: Conventions, Corporate, Corporate Event, Yachting
--   • Duplicate fallback row: content-creator-generic
--   • Role+context demotions: Wedding DJ, Corporate DJ, Beach Club DJ,
--     Club DJ, Lounge DJ, Wedding Singer, Wedding Band, Wedding Photographer,
--     Wedding Videographer, Hotel/Lifestyle Model, Tourism Model, Luxury Model
--   • Merged-into-canonical: MC (→Master of Ceremonies), Home Fixer (→Handyman)
--   • Bilingual Presenter (→Presenter + language tags)
--
-- DEMOTED (term_type changed; level/parent reassigned; row preserved) — 5 terms:
--   • Deep Tissue Massage, Relaxing Massage, Sports Massage, Couples Massage
--     → specialty/L4 under Massage Therapist
--   • Fire Dancer → specialty/L4 under Fire Performer
--
-- MOVED (parent_id reassigned; level unchanged) — 2 terms:
--   • Athlete Talent → Sports & Fitness / Sports Instructors
--   • Personal Trainer → Sports & Fitness / Fitness Coaches
--
-- ADDED (new talent_types) — 33 terms across 14 sub-type groups.
-- ADDED (new context) — Lounge under Service Contexts.
--
-- FLAGGED (new columns + value sets) — 2 columns + ≤25 flag flips:
--   • is_generic_fallback BOOLEAN — set true on up to 14 generic role names
--     (Photographer / Videographer / Stylist may not exist standalone).
--   • is_visible_by_default BOOLEAN — set false on 11 parent_categories
--     (everything outside the 8 core marketplace parents).
--
-- ALIASES APPENDED to existing canonical rows (using existing aliases TEXT[]
-- column — no new alias system created):
--   • Master of Ceremonies        ← MC, emcee
--   • Door Staff                  ← Bouncer
--   • Handyman                    ← Home Fixer
--   • Travel Agent                ← Travel Advisor, Experience Planner
--   • Trip Designer               ← Experience Planner
--   • Itinerary Planner           ← Experience Planner
--   • Fire Performer              ← Fire Dancer, flame dancer, fire show, fire act
--   • Waxing Specialist           ← Body Waxing Specialist
--
-- TALENT RE-POINTING (talent_profile_taxonomy):
--   • 14 rows — Corporate context cleanup: 6 from `corporate`, 8 from
--     `corporate-event` → `corporate-events`. Duplicate-creating rows are
--     DELETEd to avoid orphans pointing at archived terms.
--   • Role+context demotions ALSO insert the matching context tag for any
--     affected talent BEFORE the role tag is rewritten (in dry-run all 12
--     have 0 talent — but the order is correct against drift).
--
-- IDEMPOTENCY
-- ───────────
-- Every block is guarded so a re-run is a no-op:
--   • Schema:    IF NOT EXISTS
--   • Inserts:   WHERE NOT EXISTS (… WHERE slug=…)
--   • Retags:    filter by archived/non-archived state
--   • Aliases:   NOT (alias = ANY(aliases))
--   • Archives:  WHERE is_active = true
--   • Final assertion is read-only and re-runnable.
--
-- SAFETY ASSERTION (end of file)
-- ──────────────────────────────
-- Final DO block counts orphan tpt rows pointing to terms archived in this
-- migration. If any orphan exists, the transaction RAISES and ROLLBACKs.
-- This catches retag bugs that would otherwise silently strand talent.
--
-- ROLLBACK (manual)
-- ─────────────────
--   -- Re-activate archived terms:
--   UPDATE public.taxonomy_terms SET is_active = true, archived_at = NULL
--   WHERE slug IN (
--     'conventions', 'corporate', 'corporate-event', 'yachting',
--     'content-creator-generic', 'wedding-dj', 'corporate-dj',
--     'beach-club-dj', 'club-dj', 'lounge-dj', 'wedding-singer',
--     'wedding-band', 'wedding-photographer', 'wedding-videographer',
--     'hotel-lifestyle-model', 'tourism-model', 'luxury-model',
--     'mc', 'home-fixer', 'bilingual-presenter'
--   );
--
--   -- Reverse demotions (restore talent_type/L3):
--   UPDATE public.taxonomy_terms
--   SET term_type = 'talent_type', kind = 'talent_type', level = 3,
--       parent_id = (SELECT id FROM public.taxonomy_terms
--                    WHERE name_en = 'Massage & Spa' AND term_type='category_group')
--   WHERE slug IN ('deep-tissue-massage','relaxing-massage','sports-massage','couples-massage');
--
--   UPDATE public.taxonomy_terms
--   SET term_type = 'talent_type', kind = 'talent_type', level = 3,
--       parent_id = (SELECT id FROM public.taxonomy_terms
--                    WHERE name_en = 'Specialty Performers' AND term_type='category_group')
--   WHERE slug = 'fire-dancer';
--
--   -- Reverse parent moves:
--   UPDATE public.taxonomy_terms SET parent_id = (SELECT id FROM public.taxonomy_terms
--     WHERE name_en='General Dancers' AND term_type='category_group')
--   WHERE slug = 'athlete-talent';
--   UPDATE public.taxonomy_terms SET parent_id = (SELECT id FROM public.taxonomy_terms
--     WHERE name_en='Fitness & Movement' AND term_type='category_group')
--   WHERE slug = 'personal-trainer';
--
--   -- Reverse Corporate context retag — LOSSY (the original split between
--   --  `corporate` and `corporate-event` cannot be perfectly reconstructed).
--   --  Documented as a one-way structural cleanup.
--
--   -- Drop columns:
--   ALTER TABLE public.taxonomy_terms DROP COLUMN IF EXISTS is_generic_fallback;
--   ALTER TABLE public.taxonomy_terms DROP COLUMN IF EXISTS is_visible_by_default;
--
--   -- Archive new term insertions:
--   UPDATE public.taxonomy_terms SET is_active = false, archived_at = now()
--   WHERE slug IN (
--     'fitness-instructor','group-fitness-instructor','tour-seller','tour-coordinator',
--     'yacht-charter-agent','airport-greeter','vip-airport-assistant','destination-host',
--     'local-fixer','private-butler','villa-host','housekeeping-supervisor',
--     'turnover-manager','spray-tan-artist','makeup-hair-team','bridal-beauty-artist',
--     'drone-photographer','drone-pilot','event-content-creator','photo-booth-operator',
--     'live-stream-operator','event-captain','event-supervisor','lead-server',
--     'tour-driver','shuttle-driver','van-driver','bus-driver',
--     'general-maintenance-technician','pool-technician','security-supervisor',
--     'talent-coordinator','booking-coordinator','production-coordinator','lounge'
--   );
-- ============================================================================

BEGIN;

-- ─── 1. Schema additions ────────────────────────────────────────────────────

ALTER TABLE public.taxonomy_terms
  ADD COLUMN IF NOT EXISTS is_generic_fallback BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.taxonomy_terms
  ADD COLUMN IF NOT EXISTS is_visible_by_default BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.taxonomy_terms.is_generic_fallback IS
  'Bare-name fallback terms (DJ, Model, Singer, Hostess, etc.). Kept for backward compatibility and broad search; hidden from default talent-type pickers so they do not lead the list.';

COMMENT ON COLUMN public.taxonomy_terms.is_visible_by_default IS
  'When false, the term (typically a parent_category) is hidden behind a "Show all categories" toggle in the default UI. Per-tenant overrides go through agency_taxonomy_settings.is_enabled.';

-- ─── 2. New context: Lounge ─────────────────────────────────────────────────

-- Note on `kind` enum: taxonomy_kind has values (talent_type, tag, skill,
-- event_type, industry, fit_label, language, location_city, location_country).
-- Existing convention by term_type:
--   parent_category / category_group / specialty → kind='tag'
--   context                                       → kind='event_type'
--   talent_type                                   → kind='talent_type'

INSERT INTO public.taxonomy_terms
  (slug, kind, term_type, level, name_en, name_es, parent_id, is_active, sort_order)
SELECT
  'lounge', 'event_type', 'context', 2, 'Lounge', 'Lounge',
  p.id, true,
  COALESCE((SELECT MAX(sort_order) FROM public.taxonomy_terms WHERE parent_id = p.id), 100) + 10
FROM public.taxonomy_terms p
WHERE p.slug = 'service-contexts'
  AND p.term_type = 'context_group'
  AND NOT EXISTS (SELECT 1 FROM public.taxonomy_terms WHERE slug = 'lounge');

-- ─── 3. New talent_types (33 rows) ──────────────────────────────────────────
-- Slug = stable identifier (used by rollback). sort_order = MAX(group)+10*N
-- so new terms append cleanly after existing siblings.

INSERT INTO public.taxonomy_terms
  (slug, kind, term_type, level, name_en, name_es, parent_id, is_active, sort_order)
SELECT
  v.slug, 'talent_type', 'talent_type', 3,
  v.name_en, v.name_es, g.id,
  true,
  COALESCE(
    (SELECT MAX(sort_order) FROM public.taxonomy_terms WHERE parent_id = g.id),
    100
  )
  + (ROW_NUMBER() OVER (PARTITION BY g.id ORDER BY v.slug))::INT * 10
FROM (VALUES
  -- Sports & Fitness → Fitness Coaches
  ('fitness-instructor',          'Fitness Instructor',           'Instructor(a) de Fitness',          'sports-fitness',          'Fitness Coaches'),
  ('group-fitness-instructor',    'Group Fitness Instructor',     'Instructor(a) de Fitness Grupal',   'sports-fitness',          'Fitness Coaches'),
  -- Travel & Concierge → Travel Planning
  ('tour-seller',                 'Tour Seller',                  'Vendedor(a) de Tours',              'travel-concierge',        'Travel Planning'),
  ('tour-coordinator',            'Tour Coordinator',             'Coordinador(a) de Tours',           'travel-concierge',        'Travel Planning'),
  ('yacht-charter-agent',         'Yacht Charter Agent',          'Agente de Charter de Yates',        'travel-concierge',        'Travel Planning'),
  -- Travel & Concierge → Local Help
  ('airport-greeter',             'Airport Greeter',              'Recibidor(a) de Aeropuerto',        'travel-concierge',        'Local Help'),
  ('vip-airport-assistant',       'VIP Airport Assistant',        'Asistente VIP de Aeropuerto',       'travel-concierge',        'Local Help'),
  ('destination-host',            'Destination Host',             'Anfitrión(a) de Destino',           'travel-concierge',        'Local Help'),
  ('local-fixer',                 'Local Fixer',                  'Asistente Local',                   'travel-concierge',        'Local Help'),
  -- Hospitality & Property → Villa & Estate Staff
  ('private-butler',              'Private Butler',               'Mayordomo Privado',                 'hospitality-property',    'Villa & Estate Staff'),
  ('villa-host',                  'Villa Host',                   'Anfitrión(a) de Villa',             'hospitality-property',    'Villa & Estate Staff'),
  -- Hospitality & Property → Housekeeping
  ('housekeeping-supervisor',     'Housekeeping Supervisor',      'Supervisor(a) de Limpieza',         'hospitality-property',    'Housekeeping'),
  ('turnover-manager',            'Turnover Manager',             'Gerente de Rotación',               'hospitality-property',    'Housekeeping'),
  -- Wellness & Beauty → Beauty Services
  ('spray-tan-artist',            'Spray Tan Artist',             'Especialista en Bronceado',         'wellness-beauty',         'Beauty Services'),
  ('makeup-hair-team',            'Makeup & Hair Team',           'Equipo de Maquillaje y Peinado',    'wellness-beauty',         'Beauty Services'),
  ('bridal-beauty-artist',        'Bridal Beauty Artist',         'Especialista en Belleza Nupcial',   'wellness-beauty',         'Beauty Services'),
  -- Photo, Video & Creative → Photography
  ('drone-photographer',          'Drone Photographer',           'Fotógrafo(a) con Drone',            'photo-video-creative',    'Photography'),
  ('drone-pilot',                 'Drone Pilot',                  'Piloto de Drone',                   'photo-video-creative',    'Photography'),
  -- Photo, Video & Creative → Content Production
  ('event-content-creator',       'Event Content Creator',        'Creador(a) de Contenido para Eventos', 'photo-video-creative', 'Content Production'),
  ('photo-booth-operator',        'Photo Booth Operator',         'Operador(a) de Photo Booth',        'photo-video-creative',    'Content Production'),
  ('live-stream-operator',        'Live Stream Operator',         'Operador(a) de Transmisión en Vivo','photo-video-creative',    'Content Production'),
  -- Event Staff → Event Operations
  ('event-captain',               'Event Captain',                'Capitán de Evento',                 'event-staff',             'Event Operations'),
  ('event-supervisor',            'Event Supervisor',             'Supervisor(a) de Evento',           'event-staff',             'Event Operations'),
  -- Event Staff → Service Staff
  ('lead-server',                 'Lead Server',                  'Mesero(a) Principal',               'event-staff',             'Service Staff'),
  -- Transportation → Drivers
  ('tour-driver',                 'Tour Driver',                  'Chofer de Tours',                   'transportation',          'Drivers'),
  ('shuttle-driver',              'Shuttle Driver',               'Chofer de Shuttle',                 'transportation',          'Drivers'),
  ('van-driver',                  'Van Driver',                   'Chofer de Van',                     'transportation',          'Drivers'),
  ('bus-driver',                  'Bus Driver',                   'Chofer de Autobús',                 'transportation',          'Drivers'),
  -- Home & Technical Services → Skilled Trades
  ('general-maintenance-technician','General Maintenance Technician','Técnico(a) General de Mantenimiento','home-technical-services','Skilled Trades'),
  ('pool-technician',             'Pool Technician',              'Técnico(a) de Piscina',             'home-technical-services', 'Skilled Trades'),
  -- Security & Protection → Event Security
  ('security-supervisor',         'Security Supervisor',          'Supervisor(a) de Seguridad',        'security-protection',     'Event Security'),
  -- Production & Behind-the-Scenes → Event Production
  ('talent-coordinator',          'Talent Coordinator',           'Coordinador(a) de Talento',         'production-bts',          'Event Production'),
  ('booking-coordinator',         'Booking Coordinator',          'Coordinador(a) de Reservas',        'production-bts',          'Event Production'),
  ('production-coordinator',      'Production Coordinator',       'Coordinador(a) de Producción',      'production-bts',          'Event Production')
) AS v(slug, name_en, name_es, parent_slug, group_name)
JOIN public.taxonomy_terms p
  ON p.slug = v.parent_slug
  AND p.term_type = 'parent_category'
JOIN public.taxonomy_terms g
  ON g.parent_id = p.id
  AND g.name_en = v.group_name
  AND g.term_type = 'category_group'
  AND g.is_active = true
WHERE NOT EXISTS (SELECT 1 FROM public.taxonomy_terms t WHERE t.slug = v.slug);

-- ─── 4. Talent re-pointing (BEFORE archiving old terms) ─────────────────────
-- All retag steps use a temporary mapping table for clarity. Created at
-- the start of §4 and dropped at the end of §4. Two columns of interest:
--   old_term_id  → the term being retired
--   new_role_id  → the target talent_type the talent will be retagged to
--   context_ids  → array of context term ids to ALSO insert (NULL or [] for
--                  non-context demotions like canonical merges)

CREATE TEMP TABLE _tax_demote (
  old_slug      TEXT NOT NULL,
  new_role_slug TEXT NOT NULL,
  context_slugs TEXT[] NOT NULL DEFAULT '{}'
) ON COMMIT DROP;

INSERT INTO _tax_demote (old_slug, new_role_slug, context_slugs) VALUES
  -- Role+context demotions (matching §8 archive list)
  ('wedding-dj',             'dj',                       ARRAY['weddings']),
  ('corporate-dj',           'dj',                       ARRAY['corporate-events']),
  ('beach-club-dj',          'dj',                       ARRAY['beach-clubs']),
  ('club-dj',                'dj',                       ARRAY['nightclubs']),
  ('lounge-dj',              'dj',                       ARRAY['lounge']),
  ('wedding-singer',         'singer',                   ARRAY['weddings']),
  ('wedding-band',           'live-band',                ARRAY['weddings']),
  ('wedding-photographer',   'event-photographer',       ARRAY['weddings']),
  ('wedding-videographer',   'event-videographer',       ARRAY['weddings']),
  ('hotel-lifestyle-model',  'lifestyle-content-model',  ARRAY['hotels','resorts']),
  ('tourism-model',          'lifestyle-content-model',  ARRAY['tourism']),
  ('luxury-model',           'fashion-model',            ARRAY['luxury-events']),
  -- Canonical merges (no context)
  ('mc',                     'master-of-ceremonies',     ARRAY[]::TEXT[]),
  ('home-fixer',             'handyman',                 ARRAY[]::TEXT[]),
  -- Bilingual capability demotion (no context — language tags are separate)
  ('bilingual-presenter',    'presenter',                ARRAY[]::TEXT[]),
  -- Duplicate row collapse
  ('content-creator-generic','content-creator',          ARRAY[]::TEXT[]);

-- 4a. Sanity check: every mapping resolves to real, active terms.
DO $$
DECLARE
  bad_row RECORD;
BEGIN
  FOR bad_row IN
    SELECT d.old_slug, d.new_role_slug
    FROM _tax_demote d
    WHERE NOT EXISTS (
      SELECT 1 FROM public.taxonomy_terms WHERE slug = d.old_slug
    )
  LOOP
    RAISE NOTICE 'tax_cleanup_v1: old slug "%" not found — retag for this row will be a no-op', bad_row.old_slug;
  END LOOP;

  FOR bad_row IN
    SELECT d.old_slug, d.new_role_slug
    FROM _tax_demote d
    WHERE NOT EXISTS (
      SELECT 1 FROM public.taxonomy_terms
      WHERE slug = d.new_role_slug AND term_type = 'talent_type' AND is_active = true
    )
  LOOP
    RAISE EXCEPTION 'tax_cleanup_v1: new role slug "%" (target for "%") not found or inactive — aborting',
      bad_row.new_role_slug, bad_row.old_slug;
  END LOOP;
END $$;

-- IMPORTANT SCHEMA FACT: talent_profile_taxonomy PK is
-- (talent_profile_id, taxonomy_term_id). relationship_type is NOT in the PK.
-- This means a talent can hold any given term only ONCE, regardless of
-- relationship_type. All retag steps below DELETE rows that would create
-- a PK collision BEFORE running any INSERT or UPDATE that targets that term.

-- 4b. INSERT context tags FIRST (must precede the role UPDATE — otherwise
-- the source rows are gone and we can't tell who needed the context).
-- NOT EXISTS guard checks PK shape (talent_id, term_id) only.
INSERT INTO public.talent_profile_taxonomy
  (talent_profile_id, taxonomy_term_id, relationship_type, tenant_id, is_primary)
SELECT DISTINCT
  tpt.talent_profile_id,
  ctx.id,
  'context'::TEXT,
  tpt.tenant_id,
  false
FROM public.talent_profile_taxonomy tpt
JOIN _tax_demote d                  ON true
JOIN public.taxonomy_terms old_t    ON old_t.slug = d.old_slug
                                       AND tpt.taxonomy_term_id = old_t.id
JOIN UNNEST(d.context_slugs) AS cs  ON true
JOIN public.taxonomy_terms ctx      ON ctx.slug = cs AND ctx.term_type = 'context'
WHERE NOT EXISTS (
  SELECT 1 FROM public.talent_profile_taxonomy x
  WHERE x.talent_profile_id = tpt.talent_profile_id
    AND x.taxonomy_term_id  = ctx.id
);

-- 4c. Pre-clean: DELETE old-role rows for talent who already hold the new
-- role term (any relationship_type) — would PK-collide on UPDATE otherwise.
DELETE FROM public.talent_profile_taxonomy tpt
USING _tax_demote d,
      public.taxonomy_terms old_t,
      public.taxonomy_terms new_t
WHERE tpt.taxonomy_term_id = old_t.id
  AND old_t.slug = d.old_slug
  AND new_t.slug = d.new_role_slug
  AND new_t.term_type = 'talent_type'
  AND EXISTS (
    SELECT 1 FROM public.talent_profile_taxonomy x
    WHERE x.talent_profile_id = tpt.talent_profile_id
      AND x.taxonomy_term_id  = new_t.id
  );

-- Now UPDATE the remaining old-role rows to point at the new role.
UPDATE public.talent_profile_taxonomy tpt
SET taxonomy_term_id = new_t.id
FROM _tax_demote d
JOIN public.taxonomy_terms old_t ON old_t.slug = d.old_slug
JOIN public.taxonomy_terms new_t ON new_t.slug = d.new_role_slug
                                    AND new_t.term_type = 'talent_type'
                                    AND new_t.is_active = true
WHERE tpt.taxonomy_term_id = old_t.id;

-- 4d. Corporate context cleanup (14 affected rows in dry-run).
--   (1) DELETE rows where the talent already holds `corporate-events`
--       (PK-collision avoidance — checks any relationship_type).
--   (2) UPDATE remaining rows to point at corporate-events.
-- Note: in some cases a talent has BOTH `corporate` AND `corporate-event`.
-- The DELETE in (1) only fires when target already exists; the second of
-- the two source rows would then duplicate the first after UPDATE — handled
-- by step (3) — a per-talent dedupe pass.

DELETE FROM public.talent_profile_taxonomy tpt
USING public.taxonomy_terms old_t
WHERE tpt.taxonomy_term_id = old_t.id
  AND old_t.term_type = 'context'
  AND old_t.slug IN ('corporate', 'corporate-event')
  AND EXISTS (
    SELECT 1
    FROM public.talent_profile_taxonomy x
    JOIN public.taxonomy_terms target_t ON target_t.id = x.taxonomy_term_id
    WHERE x.talent_profile_id = tpt.talent_profile_id
      AND target_t.slug = 'corporate-events'
      AND target_t.term_type = 'context'
  );

-- (3) Pre-collapse talents who hold BOTH `corporate` AND `corporate-event`.
-- Keep the first one (arbitrarily by min created_at), delete the rest. After
-- this, each talent has at most one of {corporate, corporate-event}.
DELETE FROM public.talent_profile_taxonomy tpt
USING (
  SELECT talent_profile_id,
    (array_agg(taxonomy_term_id ORDER BY created_at, taxonomy_term_id))[2:]
      AS dup_term_ids
  FROM public.talent_profile_taxonomy
  WHERE taxonomy_term_id IN (
    SELECT id FROM public.taxonomy_terms
    WHERE slug IN ('corporate', 'corporate-event') AND term_type = 'context'
  )
  GROUP BY talent_profile_id
  HAVING count(*) > 1
) dups
WHERE tpt.talent_profile_id = dups.talent_profile_id
  AND tpt.taxonomy_term_id = ANY(dups.dup_term_ids);

-- (4) Now safe — UPDATE remaining single-row holders to corporate-events.
UPDATE public.talent_profile_taxonomy tpt
SET taxonomy_term_id = (
  SELECT id FROM public.taxonomy_terms
  WHERE slug = 'corporate-events' AND term_type = 'context'
)
FROM public.taxonomy_terms old_t
WHERE tpt.taxonomy_term_id = old_t.id
  AND old_t.term_type = 'context'
  AND old_t.slug IN ('corporate', 'corporate-event');

-- ─── 5. Demote massage styles to specialties under Massage Therapist ────────

UPDATE public.taxonomy_terms
SET term_type = 'specialty',
    kind = 'tag',
    level = 4,
    parent_id = (SELECT id FROM public.taxonomy_terms WHERE slug = 'massage-therapist' AND term_type = 'talent_type')
WHERE slug IN ('deep-tissue-massage', 'relaxing-massage', 'sports-massage', 'couples-massage')
  AND term_type = 'talent_type';

-- Spanish refresh for the demoted specialties (idempotent — same value either run)
UPDATE public.taxonomy_terms SET name_es = 'Tejido Profundo'  WHERE slug = 'deep-tissue-massage';
UPDATE public.taxonomy_terms SET name_es = 'Relajante'        WHERE slug = 'relaxing-massage';
UPDATE public.taxonomy_terms SET name_es = 'Masaje Deportivo' WHERE slug = 'sports-massage';
UPDATE public.taxonomy_terms SET name_es = 'Masaje en Pareja' WHERE slug = 'couples-massage';

-- ─── 6. Demote Fire Dancer → specialty under Fire Performer ─────────────────

UPDATE public.taxonomy_terms
SET term_type = 'specialty',
    kind = 'tag',
    level = 4,
    parent_id = (SELECT id FROM public.taxonomy_terms WHERE slug = 'fire-performer' AND term_type = 'talent_type')
WHERE slug = 'fire-dancer'
  AND term_type = 'talent_type';

UPDATE public.taxonomy_terms SET name_es = 'Bailarín(a) de Fuego' WHERE slug = 'fire-dancer';

-- ─── 7. Cross-parent moves ──────────────────────────────────────────────────

-- Athlete Talent → Sports & Fitness / Sports Instructors
UPDATE public.taxonomy_terms
SET parent_id = (
  SELECT g.id FROM public.taxonomy_terms g
  JOIN public.taxonomy_terms p ON p.id = g.parent_id
  WHERE p.slug = 'sports-fitness' AND g.name_en = 'Sports Instructors'
    AND g.term_type = 'category_group' AND g.is_active = true
)
WHERE slug = 'athlete-talent' AND term_type = 'talent_type';

-- Personal Trainer → Sports & Fitness / Fitness Coaches
UPDATE public.taxonomy_terms
SET parent_id = (
  SELECT g.id FROM public.taxonomy_terms g
  JOIN public.taxonomy_terms p ON p.id = g.parent_id
  WHERE p.slug = 'sports-fitness' AND g.name_en = 'Fitness Coaches'
    AND g.term_type = 'category_group' AND g.is_active = true
)
WHERE slug = 'personal-trainer' AND term_type = 'talent_type';

-- ─── 8. Soft-archive old/duplicate/demoted terms ────────────────────────────

UPDATE public.taxonomy_terms
SET is_active = false,
    archived_at = now()
WHERE slug IN (
  -- Variant contexts
  'conventions', 'corporate', 'corporate-event', 'yachting',
  -- Duplicate fallback row
  'content-creator-generic',
  -- Role+context demotions
  'wedding-dj', 'corporate-dj', 'beach-club-dj', 'club-dj', 'lounge-dj',
  'wedding-singer', 'wedding-band', 'wedding-photographer', 'wedding-videographer',
  'hotel-lifestyle-model', 'tourism-model', 'luxury-model',
  -- Canonical merges
  'mc', 'home-fixer',
  -- Bilingual capability
  'bilingual-presenter'
)
AND is_active = true;

-- ─── 9. Append aliases + search synonyms to canonical rows ──────────────────
-- Uses existing aliases / search_synonyms TEXT[] columns. Idempotent — only
-- adds when value not already present. Functions emit RAISE NOTICE if the
-- target slug doesn't exist (typo guard).

CREATE OR REPLACE FUNCTION public._taxonomy_cleanup_v1_add_alias(p_slug TEXT, p_alias TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.taxonomy_terms WHERE slug = p_slug) THEN
    RAISE NOTICE 'tax_cleanup_v1.add_alias: slug "%" not found — skipped', p_slug;
    RETURN;
  END IF;
  UPDATE public.taxonomy_terms
  SET aliases = array_append(coalesce(aliases, ARRAY[]::TEXT[]), p_alias)
  WHERE slug = p_slug
    AND NOT (p_alias = ANY(coalesce(aliases, ARRAY[]::TEXT[])));
END;
$$;

CREATE OR REPLACE FUNCTION public._taxonomy_cleanup_v1_add_synonym(p_slug TEXT, p_syn TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.taxonomy_terms WHERE slug = p_slug) THEN
    RAISE NOTICE 'tax_cleanup_v1.add_synonym: slug "%" not found — skipped', p_slug;
    RETURN;
  END IF;
  UPDATE public.taxonomy_terms
  SET search_synonyms = array_append(coalesce(search_synonyms, ARRAY[]::TEXT[]), p_syn)
  WHERE slug = p_slug
    AND NOT (p_syn = ANY(coalesce(search_synonyms, ARRAY[]::TEXT[])));
END;
$$;

-- Canonical-name aliases (replaces a former separate term)
SELECT public._taxonomy_cleanup_v1_add_alias('master-of-ceremonies', 'MC');
SELECT public._taxonomy_cleanup_v1_add_alias('master-of-ceremonies', 'emcee');
SELECT public._taxonomy_cleanup_v1_add_alias('door-staff',           'Bouncer');
SELECT public._taxonomy_cleanup_v1_add_alias('handyman',             'Home Fixer');
SELECT public._taxonomy_cleanup_v1_add_alias('travel-agent',         'Travel Advisor');
SELECT public._taxonomy_cleanup_v1_add_alias('travel-agent',         'Experience Planner');
SELECT public._taxonomy_cleanup_v1_add_alias('trip-designer',        'Experience Planner');
SELECT public._taxonomy_cleanup_v1_add_alias('itinerary-planner',    'Experience Planner');
SELECT public._taxonomy_cleanup_v1_add_alias('fire-performer',       'Fire Dancer');
SELECT public._taxonomy_cleanup_v1_add_alias('fire-performer',       'flame dancer');
SELECT public._taxonomy_cleanup_v1_add_alias('fire-performer',       'fire show');
SELECT public._taxonomy_cleanup_v1_add_alias('fire-performer',       'fire act');
SELECT public._taxonomy_cleanup_v1_add_alias('waxing-specialist',    'Body Waxing Specialist');

-- Search synonyms — broader search hits, NOT canonical aliases
SELECT public._taxonomy_cleanup_v1_add_synonym('dj',                       'wedding dj');
SELECT public._taxonomy_cleanup_v1_add_synonym('dj',                       'corporate dj');
SELECT public._taxonomy_cleanup_v1_add_synonym('dj',                       'beach club dj');
SELECT public._taxonomy_cleanup_v1_add_synonym('dj',                       'club dj');
SELECT public._taxonomy_cleanup_v1_add_synonym('dj',                       'lounge dj');
SELECT public._taxonomy_cleanup_v1_add_synonym('singer',                   'wedding singer');
SELECT public._taxonomy_cleanup_v1_add_synonym('live-band',                'wedding band');
SELECT public._taxonomy_cleanup_v1_add_synonym('event-photographer',       'wedding photographer');
SELECT public._taxonomy_cleanup_v1_add_synonym('event-videographer',       'wedding videographer');
SELECT public._taxonomy_cleanup_v1_add_synonym('lifestyle-content-model',  'hotel model');
SELECT public._taxonomy_cleanup_v1_add_synonym('lifestyle-content-model',  'tourism model');
SELECT public._taxonomy_cleanup_v1_add_synonym('fashion-model',            'luxury model');
SELECT public._taxonomy_cleanup_v1_add_synonym('massage-therapist',        'deep tissue massage');
SELECT public._taxonomy_cleanup_v1_add_synonym('massage-therapist',        'relaxing massage');
SELECT public._taxonomy_cleanup_v1_add_synonym('massage-therapist',        'sports massage');
SELECT public._taxonomy_cleanup_v1_add_synonym('massage-therapist',        'couples massage');

-- ─── 10. Generic-fallback flag ──────────────────────────────────────────────
-- Up to 14 bare-name terms get is_generic_fallback=true. The picker filters
-- them out of default lists; search still hits them. Photographer /
-- Videographer / Stylist may not exist as bare terms — the UPDATE only
-- affects rows that exist, so missing slugs are silently skipped.
-- (NB: master-of-ceremonies is NOT in this list — it is the canonical
--      replacement for archived `mc`, not a generic fallback.)

UPDATE public.taxonomy_terms
SET is_generic_fallback = true
WHERE slug IN (
  'model',
  'hostess',
  'dancer',
  'performer',
  'influencer',
  'content-creator',
  'dj',
  'singer',
  'musician',
  'brand-ambassador',
  'presenter',
  'photographer',
  'videographer',
  'stylist'
)
AND is_active = true;

-- ─── 11. Visible-by-default flag ────────────────────────────────────────────
-- Hide 11 non-core parent_categories behind "Show all categories" by default.
-- The 8 core marketplace parents (Models, Hosts & Promo, Performers, Music
-- & DJs, Chefs & Culinary, Wellness & Beauty, Photo Video & Creative,
-- Influencers & Creators) keep the default value (true).

UPDATE public.taxonomy_terms
SET is_visible_by_default = false
WHERE term_type = 'parent_category'
  AND slug IN (
    'event-staff',
    'hospitality-property',
    'travel-concierge',
    'transportation',
    'home-technical-services',
    'security-protection',
    'sports-fitness',
    'kids-family-services',
    'speakers-coaches-experts',
    'production-bts',
    'animals-specialty-acts'
  );

-- ─── 12. Cleanup helper functions ───────────────────────────────────────────

DROP FUNCTION IF EXISTS public._taxonomy_cleanup_v1_add_alias(TEXT, TEXT);
DROP FUNCTION IF EXISTS public._taxonomy_cleanup_v1_add_synonym(TEXT, TEXT);

-- ─── 13. Final safety assertion ─────────────────────────────────────────────
-- Counts orphan tpt rows pointing at terms archived in this migration.
-- If any exist, the transaction RAISES and ROLLBACKs — guarantees that
-- the COMMIT never lands in a state where talent are pointed at archived
-- terms because of a retag bug.

DO $$
DECLARE
  orphan_count INT;
  orphan_detail TEXT;
BEGIN
  SELECT count(*) INTO orphan_count
  FROM public.talent_profile_taxonomy tpt
  JOIN public.taxonomy_terms t ON t.id = tpt.taxonomy_term_id
  WHERE t.is_active = false
    AND t.archived_at IS NOT NULL
    AND t.archived_at >= now() - INTERVAL '5 minutes'
    AND t.slug IN (
      'conventions', 'corporate', 'corporate-event', 'yachting',
      'content-creator-generic',
      'wedding-dj', 'corporate-dj', 'beach-club-dj', 'club-dj', 'lounge-dj',
      'wedding-singer', 'wedding-band', 'wedding-photographer', 'wedding-videographer',
      'hotel-lifestyle-model', 'tourism-model', 'luxury-model',
      'mc', 'home-fixer', 'bilingual-presenter'
    );

  IF orphan_count > 0 THEN
    SELECT string_agg(t.slug || ' (' || cnt || ')', ', ') INTO orphan_detail
    FROM (
      SELECT t.slug, count(*)::TEXT AS cnt
      FROM public.talent_profile_taxonomy tpt
      JOIN public.taxonomy_terms t ON t.id = tpt.taxonomy_term_id
      WHERE t.is_active = false
        AND t.archived_at >= now() - INTERVAL '5 minutes'
        AND t.slug IN (
          'conventions', 'corporate', 'corporate-event', 'yachting',
          'content-creator-generic',
          'wedding-dj', 'corporate-dj', 'beach-club-dj', 'club-dj', 'lounge-dj',
          'wedding-singer', 'wedding-band', 'wedding-photographer', 'wedding-videographer',
          'hotel-lifestyle-model', 'tourism-model', 'luxury-model',
          'mc', 'home-fixer', 'bilingual-presenter'
        )
      GROUP BY t.slug
    ) t;

    RAISE EXCEPTION 'tax_cleanup_v1: % talent assignments still point to terms archived in this run (%). Aborting.',
      orphan_count, orphan_detail;
  END IF;

  RAISE NOTICE 'tax_cleanup_v1: assertion passed — 0 orphan talent assignments after retags.';
END $$;

COMMIT;
