-- ============================================================================
-- Field Seeds V1 — 2026-05-07
-- ============================================================================
--
-- WHY
-- ───
-- Phase 4 of EXEC_PLAN_field_architecture_v1.md. Seeds the new
-- type-specific fields for 6 priority talent_types, plus shared
-- group fields (Operations, Equipment trim, Trust workflow placeholders).
--
-- Reconciliation (Phase 2) renamed/merged 141 fields into canonical names.
-- Architecture (Phase 3) created 13 groups + parent→group mappings.
-- This migration adds the NEW fields (and their recommendations) that
-- weren't in the original catalog.
--
-- All fields target the PARENT_CATEGORY level (e.g., 'chefs-culinary')
-- since recommendations propagate to all children automatically via the
-- resolver's parent walk.
--
-- WHAT
-- ────
-- 1. SHARED GROUP FIELDS (new, trimmed per V1):
--    - Operational Requirements: 5 fields (1 textarea + 4 toggles)
--    - Sales / Client Interaction: 2 fields (textarea + toggle)
--    - Availability: response_time + advance_notice + responses_at_night
--    - Equipment: lightweight per-category toggles
--
-- 2. NEW TALENT_TYPE-SPECIFIC FIELDS:
--    - Chef:            10 new
--    - Performer/Dancer: 8 new
--    - Model:            5 new (most physical/wardrobe handled by physical-casting group)
--    - Travel Agent:    10 new
--    - Driver:           8 new
--    - Singer:           7 new
--
-- 3. RECOMMENDATIONS: each new field → its parent_category with
--    appropriate requirement-level flags.
--
-- ─── REQUIREMENT-LEVEL DEFAULTS (V1 light) ─────────────────────────────────
-- required_at_registration: only universal fields (handled in talent_profiles
--   columns directly — NOT type-specific fields).
-- required_before_publish: ~3-5 essential fields per type for publish gating.
-- required_before_verification: certs/license/insurance — for trust badges.
-- is_admin_only: trust statuses + commission_model.
-- requires_verification: documents + license claims.
-- ============================================================================

BEGIN;

-- ─── Helper function: insert + recommend in one go ─────────────────────────

CREATE OR REPLACE FUNCTION public._field_seed_v1_insert(
  p_field_key TEXT,
  p_label TEXT,
  p_kind TEXT,
  p_section TEXT,
  p_group_slug TEXT,
  p_parent_slugs TEXT[],
  p_required_publish BOOLEAN DEFAULT false,
  p_required_verification BOOLEAN DEFAULT false,
  p_admin_only BOOLEAN DEFAULT false,
  p_show_in_public BOOLEAN DEFAULT true,
  p_validation_rules JSONB DEFAULT NULL,
  p_show_when JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_field_id UUID;
  v_group_id UUID;
  v_parent_slug TEXT;
  v_parent_id UUID;
BEGIN
  -- NULL group_slug means: no group assignment; field still recommended
  -- per parent. The resolver picks it up via the recommendation rec, not
  -- via group inheritance.
  IF p_group_slug IS NOT NULL THEN
    SELECT id INTO v_group_id FROM public.profile_field_groups WHERE slug = p_group_slug;
    IF v_group_id IS NULL THEN
      RAISE EXCEPTION 'field_seeds_v1: group "%" not found', p_group_slug;
    END IF;
  END IF;

  -- Insert or get existing field definition
  INSERT INTO public.profile_field_definitions
    (field_key, label, tier, section, kind, field_group_id,
     is_optional, show_in_public, admin_only, is_searchable,
     validation_rules, show_when, display_order)
  VALUES
    (p_field_key, p_label, 'type-specific', p_section, p_kind, v_group_id,
     NOT p_required_publish, p_show_in_public, p_admin_only, false,
     p_validation_rules, p_show_when, 100)
  ON CONFLICT (field_key) DO UPDATE
    SET field_group_id = EXCLUDED.field_group_id,
        validation_rules = COALESCE(EXCLUDED.validation_rules, profile_field_definitions.validation_rules),
        show_when = COALESCE(EXCLUDED.show_when, profile_field_definitions.show_when)
  RETURNING id INTO v_field_id;

  -- Insert recommendations for each parent category
  FOREACH v_parent_slug IN ARRAY p_parent_slugs LOOP
    SELECT id INTO v_parent_id FROM public.taxonomy_terms
      WHERE slug = v_parent_slug AND term_type = 'parent_category';
    IF v_parent_id IS NULL THEN
      RAISE NOTICE 'field_seeds_v1: parent "%" not found, skipping recommendation for %', v_parent_slug, p_field_key;
      CONTINUE;
    END IF;

    INSERT INTO public.profile_field_recommendations
      (field_definition_id, taxonomy_term_id, relationship,
       required_before_publish, required_before_verification,
       is_admin_only, requires_verification)
    VALUES (v_field_id, v_parent_id,
            CASE WHEN p_required_publish THEN 'required' ELSE 'applies' END,
            p_required_publish, p_required_verification,
            p_admin_only, p_required_verification)
    ON CONFLICT (field_definition_id, taxonomy_term_id, relationship) DO NOTHING;
  END LOOP;

  RETURN v_field_id;
END;
$$;

-- ─── 1. SHARED GROUP FIELDS — Operational Requirements (trimmed V1) ─────────

SELECT public._field_seed_v1_insert(
  'ops.requirements_notes', 'Setup notes / requirements', 'textarea',
  'type-specific', 'operational-requirements',
  ARRAY['performers','music-djs','chefs-culinary','photo-video-creative',
        'wellness-beauty','production-bts','animals-specialty-acts','event-staff']
);
SELECT public._field_seed_v1_insert(
  'ops.requires_sound_system', 'Requires sound system', 'toggle',
  'type-specific', 'operational-requirements',
  ARRAY['performers','music-djs']
);
SELECT public._field_seed_v1_insert(
  'ops.requires_stage', 'Requires stage', 'toggle',
  'type-specific', 'operational-requirements',
  ARRAY['performers','music-djs']
);
SELECT public._field_seed_v1_insert(
  'ops.requires_parking', 'Requires parking', 'toggle',
  'type-specific', 'operational-requirements',
  ARRAY['performers','music-djs','photo-video-creative','production-bts','transportation']
);
SELECT public._field_seed_v1_insert(
  'ops.requires_power_outlet', 'Requires power outlet', 'toggle',
  'type-specific', 'operational-requirements',
  ARRAY['performers','music-djs','photo-video-creative','wellness-beauty','production-bts']
);

-- ─── 2. SHARED GROUP FIELDS — Sales / Client Interaction (trimmed V1) ──────

SELECT public._field_seed_v1_insert(
  'sales.experience_summary', 'Sales experience summary', 'textarea',
  'type-specific', 'sales-client-interaction',
  ARRAY['hosts-promo','travel-concierge','event-staff','influencers-creators','hospitality-property']
);
SELECT public._field_seed_v1_insert(
  'sales.cash_handling_certified', 'Cash handling certified', 'toggle',
  'type-specific', 'sales-client-interaction',
  ARRAY['hosts-promo','event-staff','hospitality-property','travel-concierge']
);

-- ─── 3. SHARED GROUP FIELDS — Availability ─────────────────────────────────

SELECT public._field_seed_v1_insert(
  'availability.advance_notice_hours', 'Required advance notice (hours)', 'number',
  'type-specific', 'availability',
  ARRAY['models','hosts-promo','performers','music-djs','chefs-culinary','wellness-beauty',
        'photo-video-creative','event-staff','travel-concierge','transportation','sports-fitness']
);
SELECT public._field_seed_v1_insert(
  'availability.same_day_bookings', 'Accepts same-day bookings', 'toggle',
  'type-specific', 'availability',
  ARRAY['hosts-promo','transportation','wellness-beauty','event-staff','home-technical-services']
);
SELECT public._field_seed_v1_insert(
  'availability.night_work', 'Available for night work', 'toggle',
  'type-specific', 'availability',
  ARRAY['hosts-promo','performers','music-djs','event-staff','hospitality-property',
        'security-protection','transportation']
);

-- ─── 4. SHARED GROUP FIELDS — Equipment (trimmed V1, category toggles) ─────

SELECT public._field_seed_v1_insert(
  'equipment.owns_equipment', 'Owns own equipment', 'toggle',
  'type-specific', 'equipment-tools',
  ARRAY['music-djs','photo-video-creative','wellness-beauty','production-bts','home-technical-services']
);
SELECT public._field_seed_v1_insert(
  'equipment.notes', 'Equipment notes', 'textarea',
  'type-specific', 'equipment-tools',
  ARRAY['music-djs','photo-video-creative','wellness-beauty','production-bts',
        'home-technical-services','transportation','event-staff']
);

-- ─── 5. CHEF (10 new fields) ───────────────────────────────────────────────

SELECT public._field_seed_v1_insert(
  'chef.event_capacity_min', 'Min event capacity (guests)', 'number',
  'type-specific', NULL, ARRAY['chefs-culinary'],
  false, false, false, true,
  '{"min": 1, "max": 1000}'::jsonb
);
SELECT public._field_seed_v1_insert(
  'chef.event_capacity_max', 'Max event capacity (guests)', 'number',
  'type-specific', NULL, ARRAY['chefs-culinary'],
  false, false, false, true,
  '{"min": 1, "max": 1000}'::jsonb
);
SELECT public._field_seed_v1_insert(
  'chef.menu_examples', 'Menu examples (links/files)', 'textarea',
  'type-specific', 'media-portfolio', ARRAY['chefs-culinary']
);
SELECT public._field_seed_v1_insert(
  'chef.ingredients_provided', 'Ingredients provided', 'toggle',
  'type-specific', NULL, ARRAY['chefs-culinary']
);
SELECT public._field_seed_v1_insert(
  'chef.cleanup_included', 'Cleanup included', 'select',
  'type-specific', NULL, ARRAY['chefs-culinary']
);
SELECT public._field_seed_v1_insert(
  'chef.food_handler_certified', 'Food handler certified', 'toggle',
  'type-specific', 'certifications-documents', ARRAY['chefs-culinary'],
  true, true, false, true
);
SELECT public._field_seed_v1_insert(
  'chef.villa_yacht_experience', 'Villa / yacht experience', 'toggle',
  'type-specific', NULL, ARRAY['chefs-culinary']
);
SELECT public._field_seed_v1_insert(
  'chef.staff_available', 'Staff available (sous, server)', 'toggle',
  'type-specific', NULL, ARRAY['chefs-culinary']
);
SELECT public._field_seed_v1_insert(
  'chef.cleanup_policy', 'Cleanup policy', 'select',
  'type-specific', NULL, ARRAY['chefs-culinary']
);
SELECT public._field_seed_v1_insert(
  'chef.allergens_handling', 'Allergen handling experience', 'textarea',
  'type-specific', NULL, ARRAY['chefs-culinary']
);

-- ─── 6. PERFORMER / DANCER (8 new fields) ──────────────────────────────────

SELECT public._field_seed_v1_insert(
  'performer.dance_styles', 'Dance / performance styles', 'multiselect',
  'type-specific', NULL, ARRAY['performers']
);
SELECT public._field_seed_v1_insert(
  'performer.solo_or_group', 'Solo or group act', 'select',
  'type-specific', NULL, ARRAY['performers']
);
SELECT public._field_seed_v1_insert(
  'performer.group_size', 'Group size', 'number',
  'type-specific', NULL, ARRAY['performers'],
  false, false, false, true,
  '{"min": 1, "max": 50}'::jsonb,
  '{"field_key": "performer.solo_or_group", "operator": "equals", "value": "group"}'::jsonb
);
SELECT public._field_seed_v1_insert(
  'performer.costume_options', 'Costume options', 'textarea',
  'type-specific', NULL, ARRAY['performers']
);
SELECT public._field_seed_v1_insert(
  'performer.audience_interaction', 'Audience interaction', 'toggle',
  'type-specific', NULL, ARRAY['performers']
);
SELECT public._field_seed_v1_insert(
  'performer.choreography_available', 'Choreography available', 'toggle',
  'type-specific', NULL, ARRAY['performers']
);
SELECT public._field_seed_v1_insert(
  'performer.teaching_available', 'Teaching available', 'toggle',
  'type-specific', NULL, ARRAY['performers']
);

-- ─── 7. MODEL (5 new fields — most physical handled by physical-casting) ───

SELECT public._field_seed_v1_insert(
  'model.runway_experience', 'Runway experience', 'toggle',
  'type-specific', 'experience', ARRAY['models']
);
SELECT public._field_seed_v1_insert(
  'model.runway_experience_years', 'Runway years', 'number',
  'type-specific', 'experience', ARRAY['models'],
  false, false, false, true,
  '{"min": 0, "max": 50}'::jsonb,
  '{"field_key": "model.runway_experience", "operator": "equals", "value": true}'::jsonb
);
SELECT public._field_seed_v1_insert(
  'model.shoot_experience', 'Shoot experience types', 'multiselect',
  'type-specific', 'experience', ARRAY['models']
);
SELECT public._field_seed_v1_insert(
  'model.brand_categories', 'Brand categories worked with', 'multiselect',
  'type-specific', 'experience', ARRAY['models']
);
SELECT public._field_seed_v1_insert(
  'model.ugc_content_available', 'UGC content available', 'toggle',
  'type-specific', NULL, ARRAY['models']
);
SELECT public._field_seed_v1_insert(
  'model.content_rights_available', 'Content rights available', 'select',
  'type-specific', NULL, ARRAY['models']
);

-- ─── 8. TRAVEL AGENT / TOUR AGENT (10 new fields) ──────────────────────────

SELECT public._field_seed_v1_insert(
  'travel.destinations_covered', 'Destinations covered', 'multiselect',
  'type-specific', 'service-area-travel', ARRAY['travel-concierge']
);
SELECT public._field_seed_v1_insert(
  'travel.tour_categories', 'Tour categories', 'multiselect',
  'type-specific', NULL, ARRAY['travel-concierge']
);
SELECT public._field_seed_v1_insert(
  'travel.itinerary_planning', 'Itinerary planning', 'toggle',
  'type-specific', NULL, ARRAY['travel-concierge']
);
SELECT public._field_seed_v1_insert(
  'travel.restaurant_booking', 'Restaurant booking service', 'toggle',
  'type-specific', NULL, ARRAY['travel-concierge']
);
SELECT public._field_seed_v1_insert(
  'travel.nightlife_booking', 'Nightlife booking service', 'toggle',
  'type-specific', NULL, ARRAY['travel-concierge']
);
SELECT public._field_seed_v1_insert(
  'travel.yacht_booking', 'Yacht booking service', 'toggle',
  'type-specific', NULL, ARRAY['travel-concierge']
);
SELECT public._field_seed_v1_insert(
  'travel.vendor_network', 'Vendor / supplier network', 'textarea',
  'type-specific', NULL, ARRAY['travel-concierge']
);
SELECT public._field_seed_v1_insert(
  'travel.transportation_coordination', 'Transportation coordination', 'toggle',
  'type-specific', NULL, ARRAY['travel-concierge']
);
SELECT public._field_seed_v1_insert(
  'travel.emergency_support_24_7', '24/7 emergency support', 'toggle',
  'type-specific', NULL, ARRAY['travel-concierge']
);
SELECT public._field_seed_v1_insert(
  'travel.payment_handling', 'Payment handling methods', 'multiselect',
  'type-specific', NULL, ARRAY['travel-concierge']
);
SELECT public._field_seed_v1_insert(
  'travel.commission_model', 'Commission model (admin)', 'select',
  'type-specific', NULL, ARRAY['travel-concierge'],
  false, false, true, false
);

-- ─── 9. DRIVER (8 new fields) ──────────────────────────────────────────────

SELECT public._field_seed_v1_insert(
  'transport.airport_transfer', 'Airport transfer service', 'toggle',
  'type-specific', NULL, ARRAY['transportation']
);
SELECT public._field_seed_v1_insert(
  'transport.full_day_service', 'Full day service', 'toggle',
  'type-specific', NULL, ARRAY['transportation']
);
SELECT public._field_seed_v1_insert(
  'transport.night_service', 'Night service', 'toggle',
  'type-specific', NULL, ARRAY['transportation']
);
SELECT public._field_seed_v1_insert(
  'transport.has_air_conditioning', 'Vehicle has AC', 'toggle',
  'type-specific', NULL, ARRAY['transportation']
);
SELECT public._field_seed_v1_insert(
  'transport.luggage_capacity', 'Luggage capacity', 'select',
  'type-specific', NULL, ARRAY['transportation']
);
SELECT public._field_seed_v1_insert(
  'transport.commercial_license_type', 'Commercial license type', 'select',
  'type-specific', 'certifications-documents', ARRAY['transportation'],
  false, true, false, false
);
SELECT public._field_seed_v1_insert(
  'transport.hotel_pickup_experience', 'Hotel pickup experience', 'toggle',
  'type-specific', NULL, ARRAY['transportation']
);
SELECT public._field_seed_v1_insert(
  'transport.airport_meet_and_greet', 'Airport meet & greet service', 'toggle',
  'type-specific', NULL, ARRAY['transportation']
);

-- ─── 10. SINGER (7 new fields) ─────────────────────────────────────────────

SELECT public._field_seed_v1_insert(
  'singer.performance_format', 'Performance format', 'select',
  'type-specific', NULL, ARRAY['music-djs']
);
SELECT public._field_seed_v1_insert(
  'singer.set_duration_min', 'Set duration min (minutes)', 'number',
  'type-specific', NULL, ARRAY['music-djs'],
  false, false, false, true,
  '{"min": 5, "max": 480}'::jsonb
);
SELECT public._field_seed_v1_insert(
  'singer.set_duration_max', 'Set duration max (minutes)', 'number',
  'type-specific', NULL, ARRAY['music-djs'],
  false, false, false, true,
  '{"min": 5, "max": 480}'::jsonb
);
SELECT public._field_seed_v1_insert(
  'singer.song_requests', 'Accepts song requests', 'toggle',
  'type-specific', NULL, ARRAY['music-djs']
);
SELECT public._field_seed_v1_insert(
  'singer.audio_video_links', 'Audio/video samples', 'textarea',
  'type-specific', 'media-portfolio', ARRAY['music-djs']
);
SELECT public._field_seed_v1_insert(
  'singer.backing_tracks_available', 'Backing tracks available', 'toggle',
  'type-specific', NULL, ARRAY['music-djs']
);
SELECT public._field_seed_v1_insert(
  'singer.mic_provided', 'Provides own microphone', 'toggle',
  'type-specific', NULL, ARRAY['music-djs']
);

-- ─── 11. Cleanup helper ────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public._field_seed_v1_insert(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, JSONB, JSONB
);

-- ─── 12. Final assertion ───────────────────────────────────────────────────

DO $$
DECLARE
  new_field_count INT;
  new_rec_count INT;
BEGIN
  SELECT count(*) INTO new_field_count
  FROM public.profile_field_definitions
  WHERE field_key IN (
    'ops.requirements_notes','ops.requires_sound_system','ops.requires_stage',
    'ops.requires_parking','ops.requires_power_outlet',
    'sales.experience_summary','sales.cash_handling_certified',
    'availability.advance_notice_hours','availability.same_day_bookings','availability.night_work',
    'equipment.owns_equipment','equipment.notes',
    'chef.event_capacity_min','chef.event_capacity_max','chef.menu_examples',
    'chef.ingredients_provided','chef.cleanup_included','chef.food_handler_certified',
    'chef.villa_yacht_experience','chef.staff_available','chef.cleanup_policy','chef.allergens_handling',
    'performer.dance_styles','performer.solo_or_group','performer.group_size',
    'performer.costume_options','performer.audience_interaction',
    'performer.choreography_available','performer.teaching_available',
    'model.runway_experience','model.runway_experience_years','model.shoot_experience',
    'model.brand_categories','model.ugc_content_available','model.content_rights_available',
    'travel.destinations_covered','travel.tour_categories','travel.itinerary_planning',
    'travel.restaurant_booking','travel.nightlife_booking','travel.yacht_booking',
    'travel.vendor_network','travel.transportation_coordination','travel.emergency_support_24_7',
    'travel.payment_handling','travel.commission_model',
    'transport.airport_transfer','transport.full_day_service','transport.night_service',
    'transport.has_air_conditioning','transport.luggage_capacity','transport.commercial_license_type',
    'transport.hotel_pickup_experience','transport.airport_meet_and_greet',
    'singer.performance_format','singer.set_duration_min','singer.set_duration_max',
    'singer.song_requests','singer.audio_video_links','singer.backing_tracks_available',
    'singer.mic_provided'
  );

  SELECT count(*) INTO new_rec_count
  FROM public.profile_field_recommendations pfr
  JOIN public.profile_field_definitions pfd ON pfd.id = pfr.field_definition_id
  WHERE pfd.created_at >= now() - INTERVAL '5 minutes';

  RAISE NOTICE 'field_seeds_v1: inserted % new fields, created % new recommendations',
    new_field_count, new_rec_count;

  IF new_field_count < 60 THEN
    RAISE EXCEPTION 'field_seeds_v1: expected ≥60 new fields, got %', new_field_count;
  END IF;
END $$;

COMMIT;
