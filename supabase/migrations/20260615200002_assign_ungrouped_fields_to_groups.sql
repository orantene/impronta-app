-- Workstream B2: assign active (deprecated_at IS NULL) ungrouped profile_field_definitions
-- to an existing profile_field_group.
--
-- At authoring time: 159 active fields had field_group_id IS NULL.
-- This migration assigns 138 of them to the most appropriate existing group
-- (matched by field_key prefix / section against the conventions already used by the
-- 102 fields that were grouped — see decision block below). 21 fields are intentionally
-- LEFT UNGROUPED because no existing group is a good fit (core identity/admin/internal
-- and free-narrative bio fields have no home among the 13 commerce/casting-oriented groups).
--
-- Every UPDATE is guarded `AND field_group_id IS NULL` so it is idempotent and can never
-- re-home a field an earlier migration already grouped. Reversible / organizational only.
--
-- Existing groups (slug -> name):
--   physical-casting          Physical / Casting
--   media-portfolio           Media / Portfolio
--   experience                Experience
--   service-area-travel       Service Area / Travel
--   languages-communication   Languages / Communication
--   sales-client-interaction  Sales / Client Interaction
--   equipment-tools           Equipment / Tools
--   certifications-documents  Certifications / Documents
--   rates-booking             Rates / Booking Terms
--   availability              Availability
--   context-best-fit          Best Fit / Contexts
--   operational-requirements  Operational Requirements
--   trust-verification        Trust / Verification
--
-- ============================================================================
-- DECISION BLOCK (field_key -> group, or LEFT UNGROUPED)
-- ============================================================================
-- languages-communication
--   languages
-- media-portfolio
--   albums.list, media.helloReel, media.videoLinks,
--   speaker.sample_reel, singer.audio_video_links(*already grouped — n/a),
--   creator.* handles live in media already; here we add none beyond reels/links
-- rates-booking
--   commerce.servicesMenu, commercial.askForQuote, commercial.lodgingIncluded,
--   commercial.packageRates, commercial.rateCardVisibility, commercial.rateTiers,
--   commercial.travelIncluded, rates.cards, travel.commission_model,
--   travel.payment_handling
-- experience
--   event_types, industries, social_proof.pastClients,
--   creator.audience_geo, creator.audience_total, creator.engagement_rate,
--   tech.years_experience
-- service-area-travel
--   serviceArea.homeBase, logistics.driversLicense, logistics.passportStatus,
--   logistics.upcomingVisits, logistics.visas, logistics.workEligibility,
--   transport.vehicle_type, transport.vehicle_year, transport.max_passengers,
--   transport.luggage_capacity, transport.has_air_conditioning,
--   transport.airport_transfer, transport.airport_meet_and_greet,
--   transport.hotel_pickup_experience, transport.full_day_service,
--   transport.night_service, transport.formal_attire, transport.child_seat_count,
--   tech.callout_radius_km, travel.tour_categories, travel.itinerary_planning,
--   travel.nightlife_booking, travel.restaurant_booking, travel.yacht_booking,
--   travel.transportation_coordination, travel.vendor_network,
--   travel.emergency_support_24_7
-- availability
--   availability.calendar, availability.recurring, availability.vacation,
--   tech.emergency_available
-- certifications-documents
--   tech.cert_docs_on_file, tech.licenses, tech.insurance_held,
--   speaker.credentials, kids.background_check, kids.background_check_date,
--   kids.first_aid_cpr, security.drug_alcohol_clean
-- equipment-tools
--   tech.owns_tools, performer.props_owned(*already grouped — n/a),
--   performer.travels_with_props, kids.brings_own_equipment,
--   singer.mic_provided, singer.backing_tracks_available
-- operational-requirements
--   chef.event_capacity_min, chef.event_capacity_max, chef.min_guests,
--   chef.max_guests, chef.ingredients_provided, chef.cleanup_included,
--   chef.cleanup_policy, chef.staff_available, host.max_audience_size,
--   kids.max_group_size, kids.parent_presence_required, wellness.max_per_session,
--   speaker.av_rider, performer.group_size, performer.max_height_cm,
--   performer.requires_rigging(*already grouped — n/a), event.uniform_owned,
--   event.physical_capability, hosp.uniform, hosp.pos_systems,
--   host.wardrobe_owned, performer.costume_options,
--   singer.set_duration_min, singer.set_duration_max,
--   speaker.audience_size, host.mc_capable, music.set_length,
--   performer.show_duration_minutes
-- context-best-fit
--   limits, fit_labels, tags,
--   chef.cuisine_types, chef.dietary_specialties, chef.service_style,
--   chef.allergens_handling, chef.villa_yacht_experience,
--   creator.niche, creator.platforms,
--   event.role_focus, hosp.event_types, host.event_types, host.vibe,
--   kids.activity_types, kids.age_groups,
--   model.content_rights_available, model.ugc_content_available,
--   music.act_format, music.bpm_range, music.genres, music.key_strengths,
--   performer.act_types, performer.age_appropriate, performer.audience_interaction,
--   performer.choreography_available, performer.dance_styles,
--   performer.solo_or_group, performer.teaching_available,
--   photo.deliverables, photo.formats, photo.has_retoucher,
--   singer.performance_format, singer.song_requests,
--   speaker.delivery_languages, speaker.formats, speaker.talk_length,
--   speaker.topics, tech.service_categories, host.event_types(dup-safe),
--   wellness.modalities, wellness.session_types, wellness.min_session_duration,
--   travel.tour_categories(*to service-area-travel above — n/a here)
-- trust-verification
--   consent.terms, verifications.badges, verifications.idVerified
--
-- LEFT UNGROUPED (21) — no good fit, not forced:
--   about.bioTone, about.personality, bios            (free-form narrative)
--   admin.featureInDirectory, admin.fieldLocks, admin.internalNotes,
--   emergency.contact                                 (internal/admin)
--   agency_fields.placeholder                         (placeholder)
--   identity.ageDisplayMode, identity.businessLine, identity.contactEmail,
--   identity.contactPhone, identity.dob, identity.gender, identity.legalName,
--   identity.nationality, identity.pronouns, identity.pronounsCustom,
--   identity.stageName, identity.tagline, identity.whatsapp  (core identity — no group)
-- ============================================================================

-- ---- languages-communication -------------------------------------------------
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='languages-communication') where field_key='languages' and field_group_id is null;

-- ---- media-portfolio ---------------------------------------------------------
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='media-portfolio') where field_key='albums.list' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='media-portfolio') where field_key='media.helloReel' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='media-portfolio') where field_key='media.videoLinks' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='media-portfolio') where field_key='speaker.sample_reel' and field_group_id is null;

-- ---- rates-booking -----------------------------------------------------------
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='rates-booking') where field_key='commerce.servicesMenu' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='rates-booking') where field_key='commercial.askForQuote' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='rates-booking') where field_key='commercial.lodgingIncluded' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='rates-booking') where field_key='commercial.packageRates' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='rates-booking') where field_key='commercial.rateCardVisibility' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='rates-booking') where field_key='commercial.rateTiers' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='rates-booking') where field_key='commercial.travelIncluded' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='rates-booking') where field_key='rates.cards' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='rates-booking') where field_key='travel.commission_model' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='rates-booking') where field_key='travel.payment_handling' and field_group_id is null;

-- ---- experience --------------------------------------------------------------
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='experience') where field_key='event_types' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='experience') where field_key='industries' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='experience') where field_key='social_proof.pastClients' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='experience') where field_key='creator.audience_geo' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='experience') where field_key='creator.audience_total' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='experience') where field_key='creator.engagement_rate' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='experience') where field_key='tech.years_experience' and field_group_id is null;

-- ---- service-area-travel -----------------------------------------------------
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='service-area-travel') where field_key='serviceArea.homeBase' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='service-area-travel') where field_key='logistics.driversLicense' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='service-area-travel') where field_key='logistics.passportStatus' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='service-area-travel') where field_key='logistics.upcomingVisits' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='service-area-travel') where field_key='logistics.visas' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='service-area-travel') where field_key='logistics.workEligibility' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='service-area-travel') where field_key='transport.vehicle_type' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='service-area-travel') where field_key='transport.vehicle_year' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='service-area-travel') where field_key='transport.max_passengers' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='service-area-travel') where field_key='transport.luggage_capacity' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='service-area-travel') where field_key='transport.has_air_conditioning' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='service-area-travel') where field_key='transport.airport_transfer' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='service-area-travel') where field_key='transport.airport_meet_and_greet' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='service-area-travel') where field_key='transport.hotel_pickup_experience' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='service-area-travel') where field_key='transport.full_day_service' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='service-area-travel') where field_key='transport.night_service' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='service-area-travel') where field_key='transport.formal_attire' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='service-area-travel') where field_key='transport.child_seat_count' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='service-area-travel') where field_key='tech.callout_radius_km' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='service-area-travel') where field_key='travel.tour_categories' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='service-area-travel') where field_key='travel.itinerary_planning' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='service-area-travel') where field_key='travel.nightlife_booking' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='service-area-travel') where field_key='travel.restaurant_booking' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='service-area-travel') where field_key='travel.yacht_booking' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='service-area-travel') where field_key='travel.transportation_coordination' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='service-area-travel') where field_key='travel.vendor_network' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='service-area-travel') where field_key='travel.emergency_support_24_7' and field_group_id is null;

-- ---- availability ------------------------------------------------------------
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='availability') where field_key='availability.calendar' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='availability') where field_key='availability.recurring' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='availability') where field_key='availability.vacation' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='availability') where field_key='tech.emergency_available' and field_group_id is null;

-- ---- certifications-documents -------------------------------------------------
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='certifications-documents') where field_key='tech.cert_docs_on_file' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='certifications-documents') where field_key='tech.licenses' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='certifications-documents') where field_key='tech.insurance_held' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='certifications-documents') where field_key='speaker.credentials' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='certifications-documents') where field_key='kids.background_check' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='certifications-documents') where field_key='kids.background_check_date' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='certifications-documents') where field_key='kids.first_aid_cpr' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='certifications-documents') where field_key='security.drug_alcohol_clean' and field_group_id is null;

-- ---- equipment-tools ---------------------------------------------------------
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='equipment-tools') where field_key='tech.owns_tools' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='equipment-tools') where field_key='performer.travels_with_props' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='equipment-tools') where field_key='kids.brings_own_equipment' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='equipment-tools') where field_key='singer.mic_provided' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='equipment-tools') where field_key='singer.backing_tracks_available' and field_group_id is null;

-- ---- operational-requirements -------------------------------------------------
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='operational-requirements') where field_key='chef.event_capacity_min' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='operational-requirements') where field_key='chef.event_capacity_max' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='operational-requirements') where field_key='chef.min_guests' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='operational-requirements') where field_key='chef.max_guests' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='operational-requirements') where field_key='chef.ingredients_provided' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='operational-requirements') where field_key='chef.cleanup_included' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='operational-requirements') where field_key='chef.cleanup_policy' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='operational-requirements') where field_key='chef.staff_available' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='operational-requirements') where field_key='host.max_audience_size' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='operational-requirements') where field_key='kids.max_group_size' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='operational-requirements') where field_key='kids.parent_presence_required' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='operational-requirements') where field_key='wellness.max_per_session' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='operational-requirements') where field_key='speaker.av_rider' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='operational-requirements') where field_key='performer.group_size' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='operational-requirements') where field_key='performer.max_height_cm' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='operational-requirements') where field_key='event.uniform_owned' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='operational-requirements') where field_key='event.physical_capability' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='operational-requirements') where field_key='hosp.uniform' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='operational-requirements') where field_key='hosp.pos_systems' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='operational-requirements') where field_key='host.wardrobe_owned' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='operational-requirements') where field_key='performer.costume_options' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='operational-requirements') where field_key='singer.set_duration_min' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='operational-requirements') where field_key='singer.set_duration_max' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='operational-requirements') where field_key='speaker.audience_size' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='operational-requirements') where field_key='host.mc_capable' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='operational-requirements') where field_key='music.set_length' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='operational-requirements') where field_key='performer.show_duration_minutes' and field_group_id is null;

-- ---- context-best-fit --------------------------------------------------------
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='context-best-fit') where field_key='limits' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='context-best-fit') where field_key='fit_labels' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='context-best-fit') where field_key='tags' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='context-best-fit') where field_key='chef.cuisine_types' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='context-best-fit') where field_key='chef.dietary_specialties' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='context-best-fit') where field_key='chef.service_style' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='context-best-fit') where field_key='chef.allergens_handling' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='context-best-fit') where field_key='chef.villa_yacht_experience' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='context-best-fit') where field_key='creator.niche' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='context-best-fit') where field_key='creator.platforms' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='context-best-fit') where field_key='event.role_focus' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='context-best-fit') where field_key='hosp.event_types' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='context-best-fit') where field_key='host.event_types' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='context-best-fit') where field_key='host.vibe' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='context-best-fit') where field_key='kids.activity_types' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='context-best-fit') where field_key='kids.age_groups' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='context-best-fit') where field_key='model.content_rights_available' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='context-best-fit') where field_key='model.ugc_content_available' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='context-best-fit') where field_key='music.act_format' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='context-best-fit') where field_key='music.bpm_range' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='context-best-fit') where field_key='music.genres' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='context-best-fit') where field_key='music.key_strengths' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='context-best-fit') where field_key='performer.act_types' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='context-best-fit') where field_key='performer.age_appropriate' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='context-best-fit') where field_key='performer.audience_interaction' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='context-best-fit') where field_key='performer.choreography_available' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='context-best-fit') where field_key='performer.dance_styles' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='context-best-fit') where field_key='performer.solo_or_group' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='context-best-fit') where field_key='performer.teaching_available' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='context-best-fit') where field_key='photo.deliverables' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='context-best-fit') where field_key='photo.formats' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='context-best-fit') where field_key='photo.has_retoucher' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='context-best-fit') where field_key='singer.performance_format' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='context-best-fit') where field_key='singer.song_requests' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='context-best-fit') where field_key='speaker.delivery_languages' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='context-best-fit') where field_key='speaker.formats' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='context-best-fit') where field_key='speaker.talk_length' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='context-best-fit') where field_key='speaker.topics' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='context-best-fit') where field_key='tech.service_categories' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='context-best-fit') where field_key='wellness.modalities' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='context-best-fit') where field_key='wellness.session_types' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='context-best-fit') where field_key='wellness.min_session_duration' and field_group_id is null;

-- ---- trust-verification ------------------------------------------------------
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='trust-verification') where field_key='consent.terms' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='trust-verification') where field_key='verifications.badges' and field_group_id is null;
update profile_field_definitions set field_group_id = (select id from profile_field_groups where slug='trust-verification') where field_key='verifications.idVerified' and field_group_id is null;
