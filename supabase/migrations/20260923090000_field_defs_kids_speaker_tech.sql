-- ============================================================================
-- 20260923090000_field_defs_kids_speaker_tech.sql
--
-- Author the three previously-fieldless parent categories. The
-- namespace->category recommendation migration (20260923070000) could
-- not wire these because NO field definitions existed for their domains:
--   • kids-family-services       -> new kids.*    namespace
--   • speakers-coaches-experts   -> new speaker.* namespace
--   • home-technical-services    -> new tech.*    namespace
--
-- Field sets reviewed & approved by the product owner. All are
-- tier='type-specific' + section='type-specific' so they ONLY surface
-- for talent whose type resolves the matching category (the dynamic
-- engine), never as a global crutch. is_optional defaults true;
-- default_visibility defaults {agency}.
--
-- Idempotent: field defs ON CONFLICT (field_key) DO NOTHING; recs
-- ON CONFLICT (field_definition_id, taxonomy_term_id, relationship)
-- DO NOTHING. Re-runnable, purely additive.
-- ============================================================================

-- ── 1. New field definitions ───────────────────────────────────────────────
INSERT INTO profile_field_definitions
  (field_key, label, tier, section, kind, options, helper, unit, display_order)
SELECT
  v.field_key, v.label, 'type-specific', 'type-specific',
  v.kind, v.options, v.helper, v.unit, v.display_order
FROM (VALUES
  -- kids.* — Kids & Family Services
  ('kids.age_groups',              'Age groups served',                 'multiselect', '["Toddlers (0–3)","Pre-K (4–5)","Kids (6–9)","Tweens (10–12)","Teens (13+)"]'::jsonb, 'Which age ranges this talent works with.', NULL::text, 10),
  ('kids.background_check',         'Background check on file',          'toggle',      NULL::jsonb, 'Police / criminal background check completed.', NULL, 20),
  ('kids.background_check_date',    'Background check date',             'date',        NULL::jsonb, 'When the most recent check was completed.', NULL, 30),
  ('kids.first_aid_cpr',            'First-aid / CPR certified',         'toggle',      NULL::jsonb, NULL, NULL, 40),
  ('kids.activity_types',           'Activities offered',                'chips',       NULL::jsonb, 'e.g. face painting, balloon art, magic, storytelling.', NULL, 50),
  ('kids.max_group_size',           'Max group size',                    'number',      NULL::jsonb, 'Largest group of children comfortable working with.', NULL, 60),
  ('kids.brings_own_equipment',     'Brings own equipment / props',      'toggle',      NULL::jsonb, NULL, NULL, 70),
  ('kids.parent_presence_required', 'Requires a parent/guardian present','toggle',      NULL::jsonb, NULL, NULL, 80),

  -- speaker.* — Speakers, Coaches & Experts
  ('speaker.topics',             'Topic areas',                          'chips',       NULL::jsonb, 'Subjects this speaker covers.', NULL, 10),
  ('speaker.formats',            'Talk formats',                         'multiselect', '["Keynote","Workshop","Panel","Fireside chat","Webinar","MC / Host"]'::jsonb, NULL, NULL, 20),
  ('speaker.talk_length',        'Typical talk length',                  'select',      '["≤15 min","30 min","45 min","60 min","Half-day","Full-day"]'::jsonb, NULL, NULL, 30),
  ('speaker.audience_size',      'Comfortable audience size',            'select',      '["Under 25","25–100","100–500","500–2,000","2,000+"]'::jsonb, NULL, NULL, 40),
  ('speaker.av_rider',           'AV / tech rider',                      'textarea',    NULL::jsonb, 'Equipment, staging and connectivity the speaker needs.', NULL, 50),
  ('speaker.sample_reel',        'Sample talk / showreel URL',           'text',        NULL::jsonb, NULL, NULL, 60),
  ('speaker.credentials',        'Books / certifications / credentials', 'textarea',    NULL::jsonb, NULL, NULL, 70),
  ('speaker.delivery_languages', 'Languages of delivery',                'chips',       NULL::jsonb, 'Languages the speaker can present in.', NULL, 80),

  -- tech.* — Home & Technical Services
  ('tech.service_categories', 'Service categories',                 'chips',    NULL::jsonb, 'e.g. AV, electrical, IT, handyman, on-site styling.', NULL, 10),
  ('tech.licenses',           'Trade licenses / certifications',    'chips',    NULL::jsonb, NULL, NULL, 20),
  ('tech.insurance_held',     'Liability insurance held',           'toggle',   NULL::jsonb, NULL, NULL, 30),
  ('tech.owns_tools',         'Brings own tools / equipment',       'toggle',   NULL::jsonb, NULL, NULL, 40),
  ('tech.callout_radius_km',  'Call-out radius',                    'number',   NULL::jsonb, 'Max distance willing to travel for a job.', 'km', 50),
  ('tech.emergency_available','Available for emergency / same-day',  'toggle',   NULL::jsonb, NULL, NULL, 60),
  ('tech.years_experience',   'Years of experience',                'number',   NULL::jsonb, NULL, NULL, 70),
  ('tech.cert_docs_on_file',  'Certification documents on file',    'toggle',   NULL::jsonb, NULL, NULL, 80)
) AS v(field_key, label, kind, options, helper, unit, display_order)
ON CONFLICT (field_key) DO NOTHING;

-- ── 2. Wire each namespace to its parent category ──────────────────────────
WITH ns_map(ns, category_slug) AS (
  VALUES
    ('kids',    'kids-family-services'),
    ('speaker', 'speakers-coaches-experts'),
    ('tech',    'home-technical-services')
)
INSERT INTO profile_field_recommendations
  (field_definition_id, taxonomy_term_id, relationship, display_order)
SELECT
  fd.id, tt.id, 'recommended', COALESCE(fd.display_order, 100)
FROM ns_map m
JOIN profile_field_definitions fd
  ON fd.field_key LIKE m.ns || '.%'
 AND fd.tier = 'type-specific'
 AND fd.deprecated_at IS NULL
JOIN taxonomy_terms tt
  ON tt.slug = m.category_slug
 AND tt.term_type = 'parent_category'
ON CONFLICT (field_definition_id, taxonomy_term_id, relationship)
DO NOTHING;
