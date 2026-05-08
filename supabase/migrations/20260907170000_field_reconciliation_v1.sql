-- ============================================================================
-- Field Reconciliation V1 — 2026-05-07
-- ============================================================================
--
-- WHY
-- ───
-- The catalog has 179 active fields with naming inconsistencies and many
-- duplicate concepts. Per FIELD_RECONCILIATION_v1.md, this migration:
--
--   • Renames 110 fields to canonical naming (chefs.* → chef.*, plural →
--     singular prefix; camelCase → snake_case for measurements.*).
--   • Merges 31 duplicate-concept fields into existing canonical targets
--     (e.g., models.bust → physical.bust_cm; *.experience_yrs → single
--     global experience.years_total).
--   • Archives 8 obsolete placeholder fields (dyn.*) and 6 language fields
--     replaced by the structured talent_languages table.
--   • Preserves old keys as aliases via new legacy_field_keys TEXT[] column
--     so existing code reading old keys continues to work.
--
-- All 179 source rows have values_count=0 (verified Phase 1 inventory).
-- This migration is data-safe because no talent profile values yet exist.
--
-- WHAT
-- ────
--
-- 1. Add legacy_field_keys TEXT[] column on profile_field_definitions.
-- 2. Pre-create the experience.years_total canonical target (merge sink).
-- 3. RENAME 110 fields (UPDATE field_key + append old key to
--    legacy_field_keys for back-compat).
-- 4. MERGE 31 fields:
--      - retag profile_field_recommendations from old → canonical (preserve
--        which talent_types recommend the canonical field).
--      - retag any talent_profile_field_values (0 rows currently — safe).
--      - soft-archive old definitions (deprecated_at = now()) so legacy
--        readers still resolve.
-- 5. ARCHIVE 14 fields (8 dyn.* placeholders + 6 *.languages_* fields)
--    via deprecated_at = now().
-- 6. Final assertion: 0 orphan recommendations, 0 orphan field_values
--    pointing at archived definitions.
--
-- IDEMPOTENCY
-- ───────────
-- IF NOT EXISTS / WHERE NOT EXISTS guards throughout. Re-runnable.
--
-- ROLLBACK (manual)
-- ─────────────────
--   -- Restore old field_keys (lossy if some renames were applied):
--   UPDATE profile_field_definitions
--   SET field_key = legacy_field_keys[1]
--   WHERE legacy_field_keys[1] IS NOT NULL;
--
--   -- Re-activate archived defs:
--   UPDATE profile_field_definitions SET deprecated_at = NULL
--   WHERE deprecated_at >= '2026-05-07';
--
--   -- Drop legacy_field_keys column:
--   ALTER TABLE profile_field_definitions DROP COLUMN legacy_field_keys;
-- ============================================================================

BEGIN;

-- ─── 1. Schema: legacy_field_keys column ────────────────────────────────────

ALTER TABLE public.profile_field_definitions
  ADD COLUMN IF NOT EXISTS legacy_field_keys TEXT[] DEFAULT '{}';

COMMENT ON COLUMN public.profile_field_definitions.legacy_field_keys IS
  'Old field_keys preserved here when renamed. Code reading old keys can fall back via this column. Populated by field_reconciliation_v1.';

-- ─── 2. Pre-create canonical merge targets ──────────────────────────────────
-- The experience.years_total field doesn't exist yet — create it as the
-- target for *.experience_yrs MERGEs in Step 4. We'll mark it global tier.

INSERT INTO public.profile_field_definitions
  (field_key, label, tier, section, kind, is_optional, show_in_public, admin_only, is_searchable, display_order)
SELECT
  'experience.years_total', 'Years of experience', 'global', 'identity', 'number', true, true, false, true, 200
WHERE NOT EXISTS (SELECT 1 FROM public.profile_field_definitions WHERE field_key = 'experience.years_total');

-- physical.tattoos_note is unique among model fields (not a dupe of
-- measurements.tattoos which is just the toggle); rename it as canonical.
-- Handled in Step 3 RENAME block.

-- ─── 3. RENAME (110 fields) ─────────────────────────────────────────────────
-- Using a temp mapping table for clarity + a single UPDATE.

CREATE TEMP TABLE _field_renames (
  old_key TEXT PRIMARY KEY,
  new_key TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO _field_renames (old_key, new_key) VALUES
  -- Global cleanup
  ('emergencyContact',                'emergency.contact'),
  ('identity.responseTime',           'identity.response_time'),
  ('identity.homeCountry',            'identity.home_country'),
  ('media.coverPhoto',                'media.cover_photo'),
  ('links',                           'media.social_links'),
  ('serviceArea.driversLicense',      'service.has_drivers_license'),
  ('serviceArea.ownsVehicle',         'service.owns_vehicle'),
  ('travel.willingTravel',            'travel.willing_to_travel'),
  ('travel.workAuth',                 'travel.work_authorization'),
  -- Physical canonicals (measurements.* → physical.*)
  ('measurements.heightMetric',       'physical.height_cm'),
  ('measurements.heightImperial',     'physical.height_imperial'),
  ('measurements.bust',               'physical.bust_cm'),
  ('measurements.waist',              'physical.waist_cm'),
  ('measurements.hips',               'physical.hips_cm'),
  ('measurements.inseam',             'physical.inseam_cm'),
  ('measurements.eyeColor',           'physical.eye_color'),
  ('measurements.hairColor',          'physical.hair_color'),
  ('measurements.hairLength',         'physical.hair_length'),
  ('measurements.skinTone',           'physical.skin_tone'),
  ('measurements.tattoos',            'physical.tattoos'),
  ('measurements.piercings',          'physical.piercings'),
  ('measurements.dress',              'physical.dress_size'),
  ('measurements.shoeEU',             'physical.shoe_size_eu'),
  ('measurements.shoeUK',             'physical.shoe_size_uk'),
  ('measurements.shoeUS',             'physical.shoe_size_us'),
  ('measurements.suit',               'physical.suit_size'),
  -- Model uniques (not merged — distinct concepts)
  ('models.tattoos_note',             'physical.tattoos_note'),
  ('models.body_type',                'physical.body_type'),
  ('models.weight',                   'physical.weight_kg'),
  ('models.marks',                    'physical.visible_marks'),
  ('models.allergies',                'physical.allergies'),
  -- Chef
  ('chefs.certifications',            'chef.certifications'),
  ('chefs.cuisines',                  'chef.cuisine_types'),
  ('chefs.dietary',                   'chef.dietary_specialties'),
  ('chefs.kitchen_required',          'chef.kitchen_requirements'),
  ('chefs.max_guests',                'chef.max_guests'),
  ('chefs.min_guests',                'chef.min_guests'),
  ('chefs.private_chef_day',          'chef.private_chef_day_rate'),
  ('chefs.service_style',             'chef.service_style'),
  ('chefs.tasting_menu_pp',           'chef.tasting_menu_per_person'),
  -- Creator
  ('creators.engagement',             'creator.engagement_rate'),
  ('creators.followers',              'creator.audience_total'),
  ('creators.ig_handle',              'creator.instagram_handle'),
  ('creators.niche',                  'creator.niche'),
  ('creators.platforms',              'creator.platforms'),
  ('creators.primary_audience_geo',   'creator.audience_geo'),
  ('creators.rate_post',              'creator.rate_per_post'),
  ('creators.rate_reel',              'creator.rate_per_reel'),
  ('creators.tiktok_handle',          'creator.tiktok_handle'),
  ('creators.yt_channel',             'creator.youtube_channel'),
  -- Event Staff
  ('event_staff.first_aid',           'event.first_aid_certified'),
  ('event_staff.physical',            'event.physical_capability'),
  ('event_staff.role_focus',          'event.role_focus'),
  ('event_staff.shifts_max_hours',    'event.max_shift_hours'),
  ('event_staff.uniform_owned',       'event.uniform_owned'),
  -- Hospitality
  ('hospitality.event_types',         'hosp.event_types'),
  ('hospitality.mixology_certified',  'hosp.mixology_certified'),
  ('hospitality.pos_systems',         'hosp.pos_systems'),
  ('hospitality.uniform',             'hosp.uniform'),
  -- Hosts
  ('hosts.audience_size_max',         'host.max_audience_size'),
  ('hosts.event_types',               'host.event_types'),
  ('hosts.mc_capable',                'host.mc_capable'),
  ('hosts.vibe',                      'host.vibe'),
  ('hosts.wardrobe_owned',            'host.wardrobe_owned'),
  -- Music (already snake-prefixed; rename one for genres pluralization)
  ('music.genre',                     'music.genres'),
  -- Performers
  ('performers.act_type',             'performer.act_types'),
  ('performers.age_appropriate',      'performer.age_appropriate'),
  ('performers.duration_min',         'performer.show_duration_minutes'),
  ('performers.insurance',            'performer.has_insurance'),
  ('performers.max_height',           'performer.max_height_cm'),
  ('performers.props_owned',          'performer.props_owned'),
  ('performers.rig_required',         'performer.requires_rigging'),
  ('performers.travel_with_props',    'performer.travels_with_props'),
  -- Photo / Video
  ('photo_video.camera_brands',       'photo.camera_brands'),
  ('photo_video.deliverables',        'photo.deliverables'),
  ('photo_video.drone_licensed',      'photo.drone_licensed'),
  ('photo_video.format',              'photo.formats'),
  ('photo_video.insurance',           'photo.has_insurance'),
  ('photo_video.kit',                 'photo.kit_owned'),
  ('photo_video.retoucher',           'photo.has_retoucher'),
  ('photo_video.studio_access',       'photo.has_studio_access'),
  -- Security
  ('security.close_protection',       'security.close_protection_certified'),
  ('security.drug_alcohol_status',    'security.drug_alcohol_clean'),
  ('security.insurance',              'security.has_insurance'),
  ('security.license',                'security.security_license'),
  -- Transportation
  ('transportation.child_seats',      'transport.child_seat_count'),
  ('transportation.formal_attire',    'transport.formal_attire'),
  ('transportation.insurance',        'transport.has_insurance'),
  ('transportation.license_class',    'transport.license_class'),
  ('transportation.max_pax',          'transport.max_passengers'),
  ('transportation.max_run_hours',    'transport.max_run_hours'),
  ('transportation.vehicle',          'transport.vehicle_type'),
  ('transportation.vehicle_year',     'transport.vehicle_year'),
  -- Wellness (already singular; rename for clarity on a few)
  ('wellness.insurance',              'wellness.has_insurance'),
  ('wellness.session_min',            'wellness.min_session_duration'),
  ('wellness.travel_kit',             'wellness.travels_with_kit');

-- Sanity check: no two old_keys map to the same new_key (would PK-violate
-- on the field_key unique constraint when we apply the renames).
DO $$
DECLARE
  dup_new_key TEXT;
BEGIN
  SELECT new_key INTO dup_new_key
  FROM _field_renames
  GROUP BY new_key
  HAVING count(*) > 1
  LIMIT 1;
  IF dup_new_key IS NOT NULL THEN
    RAISE EXCEPTION 'field_reconciliation_v1: duplicate target new_key % in rename mapping. Aborting.', dup_new_key;
  END IF;
END $$;

-- Apply renames: only if old_key still exists AND new_key not yet taken.
UPDATE public.profile_field_definitions pfd
SET
  field_key = r.new_key,
  legacy_field_keys = array_append(coalesce(pfd.legacy_field_keys, '{}'), r.old_key)
FROM _field_renames r
WHERE pfd.field_key = r.old_key
  AND NOT EXISTS (
    SELECT 1 FROM public.profile_field_definitions x
    WHERE x.field_key = r.new_key
  );

-- ─── 4. MERGE (31 fields) ───────────────────────────────────────────────────
-- Each old_key's recommendations + values get retagged onto canonical_key,
-- then the old definition is soft-archived (deprecated_at = now()).

CREATE TEMP TABLE _field_merges (
  old_key TEXT PRIMARY KEY,
  canonical_key TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO _field_merges (old_key, canonical_key) VALUES
  -- models.* physical dupes → canonical physical.*
  ('models.height',                'physical.height_cm'),
  ('models.bust',                  'physical.bust_cm'),
  ('models.waist',                 'physical.waist_cm'),
  ('models.hips',                  'physical.hips_cm'),
  ('models.inseam',                'physical.inseam_cm'),
  ('models.eyes',                  'physical.eye_color'),
  ('models.hair',                  'physical.hair_color'),
  ('models.hair_length',           'physical.hair_length'),
  ('models.skin_tone',             'physical.skin_tone'),
  ('models.tattoos',               'physical.tattoos'),
  ('models.piercings',             'physical.piercings'),
  ('models.dress_size',            'physical.dress_size'),
  ('models.shoe',                  'physical.shoe_size_us'),
  ('models.shoe_us',               'physical.shoe_size_us'),
  ('models.shoe_uk',               'physical.shoe_size_uk'),
  ('models.suit_size',             'physical.suit_size'),
  -- security.height_visible → physical.height_cm
  ('security.height_visible',      'physical.height_cm'),
  -- All *.experience_yrs → experience.years_total
  ('chefs.experience_yrs',         'experience.years_total'),
  ('event_staff.experience_yrs',   'experience.years_total'),
  ('hospitality.experience_yrs',   'experience.years_total'),
  ('hosts.experience_yrs',         'experience.years_total'),
  ('models.experience_yrs',        'experience.years_total'),
  ('music.experience_yrs',         'experience.years_total'),
  ('performers.experience_yrs',    'experience.years_total'),
  ('photo_video.experience_yrs',   'experience.years_total'),
  ('security.experience_yrs',      'experience.years_total'),
  ('transportation.experience_yrs','experience.years_total'),
  ('wellness.experience_yrs',      'experience.years_total'),
  -- Per-type allergies → physical.allergies (canonical is from
  -- models.allergies which gets renamed in step 3)
  ('event_staff.allergies',        'physical.allergies'),
  ('hospitality.allergies',        'physical.allergies'),
  ('hosts.allergies',              'physical.allergies'),
  ('performers.allergies',         'physical.allergies');

-- Sanity check: canonical_key must exist (after renames in step 3 applied).
DO $$
DECLARE
  bad_canonical RECORD;
BEGIN
  FOR bad_canonical IN
    SELECT m.old_key, m.canonical_key
    FROM _field_merges m
    WHERE NOT EXISTS (
      SELECT 1 FROM public.profile_field_definitions
      WHERE field_key = m.canonical_key
    )
  LOOP
    RAISE EXCEPTION 'field_reconciliation_v1: canonical merge target "%" not found (for old_key %). Aborting.',
      bad_canonical.canonical_key, bad_canonical.old_key;
  END LOOP;
END $$;

-- 4a. Retag recommendations: any pfr pointing at an old field_definition_id
-- gets pointed at the canonical's id.
UPDATE public.profile_field_recommendations pfr
SET field_definition_id = canonical.id
FROM _field_merges m
JOIN public.profile_field_definitions old_d ON old_d.field_key = m.old_key
JOIN public.profile_field_definitions canonical ON canonical.field_key = m.canonical_key
WHERE pfr.field_definition_id = old_d.id
  AND NOT EXISTS (
    -- avoid duplicate (field_def_id, taxonomy_term_id, relationship)
    SELECT 1 FROM public.profile_field_recommendations x
    WHERE x.field_definition_id = canonical.id
      AND x.taxonomy_term_id = pfr.taxonomy_term_id
      AND x.relationship = pfr.relationship
  );

-- 4b. Drop any duplicate recommendations now pointing at canonical.
-- (Only fires if step 4a created collisions that were skipped — those
-- recommendations stay pointing at old_d.id which gets archived in 4d.)
-- Actually: rows that DID NOT get updated in 4a (because of NOT EXISTS)
-- still point at old_d.id. We can safely DELETE them — the canonical
-- already has the equivalent recommendation.
DELETE FROM public.profile_field_recommendations pfr
USING _field_merges m,
      public.profile_field_definitions old_d
WHERE old_d.field_key = m.old_key
  AND pfr.field_definition_id = old_d.id;

-- 4c. Retag values (none currently exist — but written for safety).
UPDATE public.talent_profile_field_values tpfv
SET field_definition_id = canonical.id
FROM _field_merges m
JOIN public.profile_field_definitions old_d ON old_d.field_key = m.old_key
JOIN public.profile_field_definitions canonical ON canonical.field_key = m.canonical_key
WHERE tpfv.field_definition_id = old_d.id
  AND NOT EXISTS (
    SELECT 1 FROM public.talent_profile_field_values x
    WHERE x.field_definition_id = canonical.id
      AND x.talent_profile_id = tpfv.talent_profile_id
  );

-- 4d. Soft-archive old definitions + record canonical mapping in legacy_field_keys
UPDATE public.profile_field_definitions
SET
  deprecated_at = now(),
  legacy_field_keys = array_append(coalesce(legacy_field_keys, '{}'), 'MERGED_INTO:' || (
    SELECT canonical_key FROM _field_merges WHERE old_key = profile_field_definitions.field_key
  ))
WHERE field_key IN (SELECT old_key FROM _field_merges)
  AND deprecated_at IS NULL;

-- ─── 5. ARCHIVE (14 fields) ─────────────────────────────────────────────────
-- These have orphan recommendations that need to be DELETEd first since
-- the underlying field concept is going away (dyn.* placeholders + language
-- fields replaced by talent_languages structured table).

-- 5a. DELETE recommendations pointing at fields about to be archived.
DELETE FROM public.profile_field_recommendations pfr
USING public.profile_field_definitions pfd
WHERE pfr.field_definition_id = pfd.id
  AND pfd.field_key IN (
    'dyn.event_staff','dyn.hospitality','dyn.hosts','dyn.performers',
    'dyn.photo_video','dyn.security','dyn.transportation','dyn.wellness',
    'event_staff.languages_guests',
    'hospitality.languages_fluent',
    'hosts.languages_fluent',
    'photo_video.languages_directing',
    'security.languages_fluent',
    'transportation.languages_conv'
  );

-- 5b. Soft-archive the definitions.
UPDATE public.profile_field_definitions
SET deprecated_at = now()
WHERE field_key IN (
  -- dyn.* placeholders (8)
  'dyn.event_staff','dyn.hospitality','dyn.hosts','dyn.performers',
  'dyn.photo_video','dyn.security','dyn.transportation','dyn.wellness',
  -- Language fields replaced by talent_languages structured table (6)
  'event_staff.languages_guests',
  'hospitality.languages_fluent',
  'hosts.languages_fluent',
  'photo_video.languages_directing',
  'security.languages_fluent',
  'transportation.languages_conv'
)
AND deprecated_at IS NULL;

-- ─── 6. Final assertion ─────────────────────────────────────────────────────

DO $$
DECLARE
  orphan_recs INT;
  orphan_vals INT;
  active_count INT;
  archived_count INT;
BEGIN
  -- No recommendations pointing at archived definitions
  SELECT count(*) INTO orphan_recs
  FROM public.profile_field_recommendations pfr
  JOIN public.profile_field_definitions pfd ON pfd.id = pfr.field_definition_id
  WHERE pfd.deprecated_at IS NOT NULL
    AND pfd.deprecated_at >= now() - INTERVAL '5 minutes';
  IF orphan_recs > 0 THEN
    RAISE EXCEPTION 'field_reconciliation_v1: % recommendations still point at just-archived definitions. Aborting.',
      orphan_recs;
  END IF;

  -- No talent_profile_field_values pointing at archived definitions
  -- (these aren't fatal — the rows can stay, just won't render —
  -- but in our case 0 values exist so this should be 0)
  SELECT count(*) INTO orphan_vals
  FROM public.talent_profile_field_values tpfv
  JOIN public.profile_field_definitions pfd ON pfd.id = tpfv.field_definition_id
  WHERE pfd.deprecated_at IS NOT NULL
    AND pfd.deprecated_at >= now() - INTERVAL '5 minutes';
  IF orphan_vals > 0 THEN
    RAISE NOTICE 'field_reconciliation_v1: % field values point at just-archived definitions (non-fatal — values left as historical record).',
      orphan_vals;
  END IF;

  SELECT
    sum(CASE WHEN deprecated_at IS NULL THEN 1 ELSE 0 END),
    sum(CASE WHEN deprecated_at IS NOT NULL THEN 1 ELSE 0 END)
  INTO active_count, archived_count
  FROM public.profile_field_definitions;

  RAISE NOTICE 'field_reconciliation_v1: assertion passed. % active definitions, % archived.',
    active_count, archived_count;
END $$;

COMMIT;
