-- Test profiles for the Taxonomy v2 marketplace.
--
-- Six talent profiles that together exercise the search/filter surface:
--   1. Sofia   — Promotional Model + Pop Singer + English-fluent + Luxury Sales (Cancún)
--   2. Maria   — Editorial Model + VIP Host + Belly Dancer (Tulum)
--   3. Liam    — Fire Dancer (Tulum)
--   4. Lucia   — Villa Cleaner + Housekeeper (Playa del Carmen)
--   5. Diego   — Travel Agent + Personal Concierge + multilingual (Tulum)
--   6. Carlos  — Private Driver + VIP Driver (home Cancún, travels to Tulum)
--
-- Idempotent: re-running this file will UPSERT profiles by stable
-- profile_codes (TEST-TAX-V2-1..6). Run AFTER the v2 taxonomy migrations.
--
-- ─── EXPECTED QUERY MATCHES (V1 search behavior) ──────────────────────────
--
-- "model in Cancún who can sing"
--   → Talent Type descendants of `parent_category:models`
--     ∩ talent_service_areas WHERE city_slug='cancun'
--     ∩ (relationship_type='secondary_role' on talent_type=`pop-singer` OR
--        relationship_type='skill' on skill='singing-skill')
--   Expected match: Sofia
--
-- "fire dancer in Tulum"
--   → talent_type='fire-dancer' (direct OR search_synonyms expansion)
--     ∩ talent_service_areas WHERE city_slug='tulum'
--   Expected match: Liam
--
-- "housekeeper in Playa del Carmen"
--   → Talent Type descendants of `parent_category:hospitality-property`
--     filtered to housekeeper / villa-cleaner / cleaner
--     ∩ talent_service_areas WHERE city_slug='playa-del-carmen'
--   Expected match: Lucia
--
-- "travel agent who speaks English"
--   → talent_type='travel-agent'
--     ∩ talent_languages WHERE language_code='en'
--       AND language_level_rank(speaking_level) >= language_level_rank('professional')
--   Expected match: Diego
--
-- "promotional model who can sell"
--   → talent_type='promotional-model'
--     ∩ relationship_type='skill' on any skill in skill_group='sales-promotion'
--       (e.g. luxury-sales, product-sales)
--   Expected match: Sofia
--
-- "performer for beach club"
--   → Talent Type descendants of `parent_category:performers`
--     ∩ relationship_type='context' on context='beach-clubs'
--   Expected match: Liam
--
-- "driver in Cancún who can travel to Tulum"
--   → talent_type='private-driver' OR descendants of `category_group:drivers`
--     ∩ talent_service_areas where (service_kind='home_base' AND
--       location.city_slug='cancun') AND (service_kind='travel_to' AND
--       location.city_slug='tulum')
--   Expected match: Carlos

BEGIN;

-- Stable user IDs (deterministic from profile_code so re-runs are stable).
-- These don't correspond to real auth.users rows; talent_profiles.user_id is
-- nullable so it's fine to leave as NULL.

DO $$
DECLARE
  -- Tenant for all test profiles: default Impronta tenant.
  v_tenant UUID := '00000000-0000-0000-0000-000000000001'::UUID;

  -- Talent profile IDs (deterministic).
  v_sofia  UUID;
  v_maria  UUID;
  v_liam   UUID;
  v_lucia  UUID;
  v_diego  UUID;
  v_carlos UUID;

  -- Location IDs (resolved from existing public.locations rows, seeded by init.sql).
  v_loc_cancun  UUID;
  v_loc_tulum   UUID;
  v_loc_playa   UUID;
BEGIN
  -- Resolve locations. If any is missing, the migration init seed didn't
  -- include them — fail loudly so we know to add them.
  SELECT id INTO v_loc_cancun FROM public.locations WHERE country_code = 'MX' AND city_slug = 'cancun' LIMIT 1;
  SELECT id INTO v_loc_tulum  FROM public.locations WHERE country_code = 'MX' AND city_slug IN ('tulum') LIMIT 1;
  SELECT id INTO v_loc_playa  FROM public.locations WHERE country_code = 'MX' AND city_slug = 'playa-del-carmen' LIMIT 1;

  IF v_loc_cancun IS NULL THEN
    INSERT INTO public.locations (country_code, city_slug, display_name_en, display_name_es)
      VALUES ('MX','cancun','Cancún','Cancún') RETURNING id INTO v_loc_cancun;
  END IF;
  IF v_loc_tulum IS NULL THEN
    INSERT INTO public.locations (country_code, city_slug, display_name_en, display_name_es)
      VALUES ('MX','tulum','Tulum','Tulum') RETURNING id INTO v_loc_tulum;
  END IF;
  IF v_loc_playa IS NULL THEN
    INSERT INTO public.locations (country_code, city_slug, display_name_en, display_name_es)
      VALUES ('MX','playa-del-carmen','Playa del Carmen','Playa del Carmen') RETURNING id INTO v_loc_playa;
  END IF;

  -- ─── Upsert profiles (stable UUIDs from profile_code) ────────────────
  v_sofia  := ('aaaa0001-' || substr(md5('TEST-TAX-V2-1'),1,4) || '-4000-8000-' || substr(md5('TEST-TAX-V2-1'),9,12))::UUID;
  v_maria  := ('aaaa0002-' || substr(md5('TEST-TAX-V2-2'),1,4) || '-4000-8000-' || substr(md5('TEST-TAX-V2-2'),9,12))::UUID;
  v_liam   := ('aaaa0003-' || substr(md5('TEST-TAX-V2-3'),1,4) || '-4000-8000-' || substr(md5('TEST-TAX-V2-3'),9,12))::UUID;
  v_lucia  := ('aaaa0004-' || substr(md5('TEST-TAX-V2-4'),1,4) || '-4000-8000-' || substr(md5('TEST-TAX-V2-4'),9,12))::UUID;
  v_diego  := ('aaaa0005-' || substr(md5('TEST-TAX-V2-5'),1,4) || '-4000-8000-' || substr(md5('TEST-TAX-V2-5'),9,12))::UUID;
  v_carlos := ('aaaa0006-' || substr(md5('TEST-TAX-V2-6'),1,4) || '-4000-8000-' || substr(md5('TEST-TAX-V2-6'),9,12))::UUID;

  INSERT INTO public.talent_profiles
    (id, profile_code, public_slug_part, display_name, first_name, last_name, short_bio,
     workflow_status, visibility, location_id, gender, created_by_agency_id)
  VALUES
    (v_sofia,  'TEST-TAX-V2-1', 'sofia-test',  'Sofia Martinez', 'Sofia',  'Martinez', 'Promotional model + pop singer with luxury sales experience.',                  'approved', 'public', v_loc_cancun, 'female', v_tenant),
    (v_maria,  'TEST-TAX-V2-2', 'maria-test',  'Maria Lopez',    'Maria',  'Lopez',    'Editorial model + VIP host + belly dancer for luxury events.',                 'approved', 'public', v_loc_tulum,  'female', v_tenant),
    (v_liam,   'TEST-TAX-V2-3', 'liam-test',   'Liam Rivera',    'Liam',   'Rivera',   'Fire dancer for beach clubs, nightclubs, and luxury events.',                  'approved', 'public', v_loc_tulum,  'male',   v_tenant),
    (v_lucia,  'TEST-TAX-V2-4', 'lucia-test',  'Lucia Hernandez','Lucia',  'Hernandez','Villa cleaner and housekeeper for private villas, hotels, and Airbnbs.',      'approved', 'public', v_loc_playa,  'female', v_tenant),
    (v_diego,  'TEST-TAX-V2-5', 'diego-test',  'Diego Ruiz',     'Diego',  'Ruiz',     'Travel agent + personal concierge with multilingual VIP service experience.','approved', 'public', v_loc_tulum,  'male',   v_tenant),
    (v_carlos, 'TEST-TAX-V2-6', 'carlos-test', 'Carlos Mendez',  'Carlos', 'Mendez',   'Private VIP driver based in Cancún, regular routes to Tulum and Playa.',     'approved', 'public', v_loc_cancun, 'male',   v_tenant)
  ON CONFLICT (profile_code) DO UPDATE SET
    display_name = EXCLUDED.display_name, first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name, short_bio = EXCLUDED.short_bio,
    workflow_status = EXCLUDED.workflow_status, visibility = EXCLUDED.visibility,
    location_id = EXCLUDED.location_id, gender = EXCLUDED.gender,
    updated_at = now();

  -- Refresh local UUIDs from the inserted/updated rows (in case ON CONFLICT changed them).
  SELECT id INTO v_sofia  FROM public.talent_profiles WHERE profile_code = 'TEST-TAX-V2-1';
  SELECT id INTO v_maria  FROM public.talent_profiles WHERE profile_code = 'TEST-TAX-V2-2';
  SELECT id INTO v_liam   FROM public.talent_profiles WHERE profile_code = 'TEST-TAX-V2-3';
  SELECT id INTO v_lucia  FROM public.talent_profiles WHERE profile_code = 'TEST-TAX-V2-4';
  SELECT id INTO v_diego  FROM public.talent_profiles WHERE profile_code = 'TEST-TAX-V2-5';
  SELECT id INTO v_carlos FROM public.talent_profiles WHERE profile_code = 'TEST-TAX-V2-6';

  -- ─── talent_profile_taxonomy ────────────────────────────────────────
  -- Idempotent via PRIMARY KEY (talent_profile_id, taxonomy_term_id).

  -- Sofia: primary Promotional Model; secondary Pop Singer + Luxury Sales skill
  --        + Guest Interaction skill + Brand Activations/Luxury Events contexts.
  INSERT INTO public.talent_profile_taxonomy (talent_profile_id, taxonomy_term_id, relationship_type, is_primary, tenant_id, display_order) VALUES
    (v_sofia, public.taxv1_uuid('talent_type','promotional-model'),  'primary_role',  TRUE,  v_tenant, 0),
    (v_sofia, public.taxv1_uuid('talent_type','pop-singer'),         'secondary_role',FALSE, v_tenant, 1),
    (v_sofia, public.taxv1_uuid('skill','luxury-sales'),             'skill',         FALSE, v_tenant, 0),
    (v_sofia, public.taxv1_uuid('skill','product-sales'),            'skill',         FALSE, v_tenant, 1),
    (v_sofia, public.taxv1_uuid('skill','guest-interaction'),        'skill',         FALSE, v_tenant, 2),
    (v_sofia, public.taxv1_uuid('skill','runway-walk'),              'skill',         FALSE, v_tenant, 3),
    (v_sofia, public.taxv1_uuid('skill','singing-skill'),            'skill',         FALSE, v_tenant, 4),
    (v_sofia, public.taxv1_uuid('context','brand-activations'),      'context',       FALSE, v_tenant, 0),
    (v_sofia, public.taxv1_uuid('context','luxury-events'),          'context',       FALSE, v_tenant, 1)
  ON CONFLICT (talent_profile_id, taxonomy_term_id) DO UPDATE SET
    relationship_type = EXCLUDED.relationship_type, is_primary = EXCLUDED.is_primary,
    tenant_id = EXCLUDED.tenant_id, display_order = EXCLUDED.display_order, updated_at = now();

  -- Maria
  INSERT INTO public.talent_profile_taxonomy (talent_profile_id, taxonomy_term_id, relationship_type, is_primary, tenant_id, display_order) VALUES
    (v_maria, public.taxv1_uuid('talent_type','editorial-model'),    'primary_role',  TRUE,  v_tenant, 0),
    (v_maria, public.taxv1_uuid('talent_type','vip-host'),           'secondary_role',FALSE, v_tenant, 1),
    (v_maria, public.taxv1_uuid('talent_type','cultural-dancer'),    'secondary_role',FALSE, v_tenant, 2),
    (v_maria, public.taxv1_uuid('specialty','belly-dancer'),         'specialty',     FALSE, v_tenant, 0),
    (v_maria, public.taxv1_uuid('skill','stage-presence'),           'skill',         FALSE, v_tenant, 0),
    (v_maria, public.taxv1_uuid('skill','posing-skill'),             'skill',         FALSE, v_tenant, 1),
    (v_maria, public.taxv1_uuid('skill','luxury-etiquette'),         'skill',         FALSE, v_tenant, 2),
    (v_maria, public.taxv1_uuid('context','photo-shoots'),           'context',       FALSE, v_tenant, 0),
    (v_maria, public.taxv1_uuid('context','luxury-events'),          'context',       FALSE, v_tenant, 1),
    (v_maria, public.taxv1_uuid('context','yachts'),                 'context',       FALSE, v_tenant, 2)
  ON CONFLICT (talent_profile_id, taxonomy_term_id) DO UPDATE SET
    relationship_type = EXCLUDED.relationship_type, is_primary = EXCLUDED.is_primary,
    tenant_id = EXCLUDED.tenant_id, display_order = EXCLUDED.display_order, updated_at = now();

  -- Liam
  INSERT INTO public.talent_profile_taxonomy (talent_profile_id, taxonomy_term_id, relationship_type, is_primary, tenant_id, display_order) VALUES
    (v_liam, public.taxv1_uuid('talent_type','fire-dancer'),         'primary_role',  TRUE,  v_tenant, 0),
    (v_liam, public.taxv1_uuid('skill','fire-performance'),          'skill',         FALSE, v_tenant, 0),
    (v_liam, public.taxv1_uuid('skill','stage-presence'),            'skill',         FALSE, v_tenant, 1),
    (v_liam, public.taxv1_uuid('skill','choreography'),              'skill',         FALSE, v_tenant, 2),
    (v_liam, public.taxv1_uuid('context','beach-clubs'),             'context',       FALSE, v_tenant, 0),
    (v_liam, public.taxv1_uuid('context','nightclubs'),              'context',       FALSE, v_tenant, 1),
    (v_liam, public.taxv1_uuid('context','luxury-events'),           'context',       FALSE, v_tenant, 2)
  ON CONFLICT (talent_profile_id, taxonomy_term_id) DO UPDATE SET
    relationship_type = EXCLUDED.relationship_type, is_primary = EXCLUDED.is_primary,
    tenant_id = EXCLUDED.tenant_id, display_order = EXCLUDED.display_order, updated_at = now();

  -- Lucia
  INSERT INTO public.talent_profile_taxonomy (talent_profile_id, taxonomy_term_id, relationship_type, is_primary, tenant_id, display_order) VALUES
    (v_lucia, public.taxv1_uuid('talent_type','villa-cleaner'),      'primary_role',  TRUE,  v_tenant, 0),
    (v_lucia, public.taxv1_uuid('talent_type','housekeeper'),        'secondary_role',FALSE, v_tenant, 1),
    (v_lucia, public.taxv1_uuid('talent_type','hotel-room-attendant'),'secondary_role',FALSE, v_tenant, 2),
    (v_lucia, public.taxv1_uuid('skill','room-turnover'),            'skill',         FALSE, v_tenant, 0),
    (v_lucia, public.taxv1_uuid('skill','discretion-privacy'),       'skill',         FALSE, v_tenant, 1),
    (v_lucia, public.taxv1_uuid('context','private-villas'),         'context',       FALSE, v_tenant, 0),
    (v_lucia, public.taxv1_uuid('context','airbnbs'),                'context',       FALSE, v_tenant, 1),
    (v_lucia, public.taxv1_uuid('context','hotels'),                 'context',       FALSE, v_tenant, 2)
  ON CONFLICT (talent_profile_id, taxonomy_term_id) DO UPDATE SET
    relationship_type = EXCLUDED.relationship_type, is_primary = EXCLUDED.is_primary,
    tenant_id = EXCLUDED.tenant_id, display_order = EXCLUDED.display_order, updated_at = now();

  -- Diego
  INSERT INTO public.talent_profile_taxonomy (talent_profile_id, taxonomy_term_id, relationship_type, is_primary, tenant_id, display_order) VALUES
    (v_diego, public.taxv1_uuid('talent_type','travel-agent'),       'primary_role',  TRUE,  v_tenant, 0),
    (v_diego, public.taxv1_uuid('talent_type','personal-concierge'), 'secondary_role',FALSE, v_tenant, 1),
    (v_diego, public.taxv1_uuid('talent_type','local-experience-host'),'secondary_role',FALSE, v_tenant, 2),
    (v_diego, public.taxv1_uuid('skill','real-estate-knowledge'),    'skill',         FALSE, v_tenant, 0),
    (v_diego, public.taxv1_uuid('skill','vip-guest-service'),        'skill',         FALSE, v_tenant, 1),
    (v_diego, public.taxv1_uuid('skill','vendor-negotiation'),       'skill',         FALSE, v_tenant, 2),
    (v_diego, public.taxv1_uuid('context','tourism-experiences'),    'context',       FALSE, v_tenant, 0),
    (v_diego, public.taxv1_uuid('context','vip-experiences'),        'context',       FALSE, v_tenant, 1),
    (v_diego, public.taxv1_uuid('context','private-villas'),         'context',       FALSE, v_tenant, 2)
  ON CONFLICT (talent_profile_id, taxonomy_term_id) DO UPDATE SET
    relationship_type = EXCLUDED.relationship_type, is_primary = EXCLUDED.is_primary,
    tenant_id = EXCLUDED.tenant_id, display_order = EXCLUDED.display_order, updated_at = now();

  -- Carlos (Driver — proves the cross-city travel filter)
  INSERT INTO public.talent_profile_taxonomy (talent_profile_id, taxonomy_term_id, relationship_type, is_primary, tenant_id, display_order) VALUES
    (v_carlos, public.taxv1_uuid('talent_type','private-driver'),    'primary_role',  TRUE,  v_tenant, 0),
    (v_carlos, public.taxv1_uuid('talent_type','vip-driver'),        'secondary_role',FALSE, v_tenant, 1),
    (v_carlos, public.taxv1_uuid('talent_type','airport-transfer-driver'),'secondary_role',FALSE,v_tenant,2),
    (v_carlos, public.taxv1_uuid('skill','vip-guest-service'),       'skill',         FALSE, v_tenant, 0),
    (v_carlos, public.taxv1_uuid('skill','discretion-privacy'),      'skill',         FALSE, v_tenant, 1),
    (v_carlos, public.taxv1_uuid('context','vip-experiences'),       'context',       FALSE, v_tenant, 0),
    (v_carlos, public.taxv1_uuid('context','luxury-events'),         'context',       FALSE, v_tenant, 1)
  ON CONFLICT (talent_profile_id, taxonomy_term_id) DO UPDATE SET
    relationship_type = EXCLUDED.relationship_type, is_primary = EXCLUDED.is_primary,
    tenant_id = EXCLUDED.tenant_id, display_order = EXCLUDED.display_order, updated_at = now();

  -- ─── talent_languages ────────────────────────────────────────────────
  INSERT INTO public.talent_languages (tenant_id, talent_profile_id, language_code, language_name, speaking_level, is_native, can_host, can_sell, display_order) VALUES
    (v_tenant, v_sofia, 'es', 'Spanish', 'native', TRUE,  TRUE, TRUE, 0),
    (v_tenant, v_sofia, 'en', 'English', 'fluent', FALSE, TRUE, TRUE, 1),

    (v_tenant, v_maria, 'es', 'Spanish', 'native', TRUE,  TRUE, TRUE, 0),
    (v_tenant, v_maria, 'en', 'English', 'fluent', FALSE, TRUE, TRUE, 1),
    (v_tenant, v_maria, 'fr', 'French',  'conversational', FALSE, FALSE, FALSE, 2),

    (v_tenant, v_liam,  'en', 'English', 'native', TRUE,  FALSE, FALSE, 0),
    (v_tenant, v_liam,  'es', 'Spanish', 'conversational', FALSE, FALSE, FALSE, 1),

    (v_tenant, v_lucia, 'es', 'Spanish', 'native', TRUE,  FALSE, FALSE, 0),
    (v_tenant, v_lucia, 'en', 'English', 'conversational', FALSE, FALSE, FALSE, 1),

    (v_tenant, v_diego, 'es', 'Spanish', 'native', TRUE,  TRUE, TRUE, 0),
    (v_tenant, v_diego, 'en', 'English', 'fluent', FALSE, TRUE, TRUE, 1),
    (v_tenant, v_diego, 'it', 'Italian', 'conversational', FALSE, FALSE, FALSE, 2),

    (v_tenant, v_carlos,'es', 'Spanish', 'native', TRUE,  FALSE, FALSE, 0),
    (v_tenant, v_carlos,'en', 'English', 'professional', FALSE, FALSE, FALSE, 1)
  ON CONFLICT (talent_profile_id, language_code) DO UPDATE SET
    language_name = EXCLUDED.language_name, speaking_level = EXCLUDED.speaking_level,
    is_native = EXCLUDED.is_native, can_host = EXCLUDED.can_host, can_sell = EXCLUDED.can_sell,
    display_order = EXCLUDED.display_order, updated_at = now();

  UPDATE public.talent_languages SET can_translate = TRUE
   WHERE talent_profile_id = v_diego AND language_code IN ('en','es','it');

  -- ─── talent_service_areas ────────────────────────────────────────────
  -- home_base for everyone, plus travel_to for Carlos and Sofia.
  INSERT INTO public.talent_service_areas (tenant_id, talent_profile_id, location_id, service_kind, display_order) VALUES
    (v_tenant, v_sofia,  v_loc_cancun, 'home_base', 0),
    (v_tenant, v_sofia,  v_loc_tulum,  'travel_to', 1),
    (v_tenant, v_sofia,  v_loc_playa,  'travel_to', 2),
    (v_tenant, v_maria,  v_loc_tulum,  'home_base', 0),
    (v_tenant, v_maria,  v_loc_playa,  'travel_to', 1),
    (v_tenant, v_liam,   v_loc_tulum,  'home_base', 0),
    (v_tenant, v_liam,   v_loc_playa,  'travel_to', 1),
    (v_tenant, v_lucia,  v_loc_playa,  'home_base', 0),
    (v_tenant, v_lucia,  v_loc_tulum,  'travel_to', 1),
    (v_tenant, v_diego,  v_loc_tulum,  'home_base', 0),
    (v_tenant, v_diego,  v_loc_playa,  'travel_to', 1),
    (v_tenant, v_diego,  v_loc_cancun, 'travel_to', 2),
    (v_tenant, v_carlos, v_loc_cancun, 'home_base', 0),
    (v_tenant, v_carlos, v_loc_tulum,  'travel_to', 1),
    (v_tenant, v_carlos, v_loc_playa,  'travel_to', 2)
  ON CONFLICT (talent_profile_id, location_id, service_kind) DO UPDATE SET
    display_order = EXCLUDED.display_order, updated_at = now();
END $$;

COMMIT;
