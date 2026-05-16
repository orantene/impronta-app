-- ============================================================================
-- 20260923070000_field_recs_namespace_to_category.sql
--
-- COMPREHENSIVE talent-type -> specialty-field wiring.
--
-- Problem: profile_field_recommendations was populated for only a handful
-- of parent categories, so selecting a talent type populated almost no
-- type-specific fields and the catalog leaned on `tier='global'` as a
-- crutch (every field shown to every talent). The user's directive: make
-- EVERY parent category resolve its correct specialty fields dynamically
-- — "music or tour travel or any parent categories, all fields should
-- work dynamically… do it for all".
--
-- Approach: the 158 type-specific field definitions are namespaced by
-- field_key prefix (chef.*, model.*, performer.*, music.*, transport.*,
-- security.*, photo.*, event.*, host.*, hosp.*, wellness.*, creator.*,
-- physical.*, ops.*, equipment.*, sales.*, singer.*). Each namespace maps
-- to the parent category (or categories, for cross-cutting ones) whose
-- talent it describes. The resolver (getFieldsForTalent) already walks
-- the parent chain, so recommending a field to a parent_category term
-- propagates to every leaf talent type under it.
--
-- Idempotent: relationship='recommended', ON CONFLICT (the existing
-- UNIQUE(field_definition_id, taxonomy_term_id, relationship)) DO
-- NOTHING. Purely additive — never deletes a rec, so it cannot regress
-- a category that was already wired; it only fills the gaps.
--
-- travel.* is intentionally EXCLUDED: those fields are suppressed from
-- the Specialty-details editor and routed to the dedicated (currently
-- hardcoded) Logistics section, so recommending them would wire fields
-- that never render until the Logistics engine-unification lands.
--
-- NOT covered (no matching field namespace exists — genuine content gap,
-- surfaced to product, NOT silently invented here):
--   • kids-family-services
--   • speakers-coaches-experts
--   • home-technical-services
-- These parent categories need their own field definitions authored.
-- ============================================================================

WITH ns_map(ns, category_slug) AS (
  VALUES
    -- domain-exclusive namespaces
    ('chef',      'chefs-culinary'),
    ('model',     'models'),
    ('performer', 'performers'),
    ('music',     'music-djs'),
    ('singer',    'music-djs'),
    ('transport', 'transportation'),
    ('security',  'security-protection'),
    ('photo',     'photo-video-creative'),
    ('event',     'event-staff'),
    ('host',      'hosts-promo'),
    ('sales',     'hosts-promo'),
    ('hosp',      'hospitality-property'),
    ('wellness',  'wellness-beauty'),
    ('creator',   'influencers-creators'),
    -- cross-cutting: appearance-booked categories all need physical/casting
    ('physical',  'models'),
    ('physical',  'performers'),
    ('physical',  'hosts-promo'),
    ('physical',  'wellness-beauty'),
    ('physical',  'influencers-creators'),
    ('physical',  'sports-fitness'),
    -- cross-cutting: performance fields also fit animals/specialty + fitness
    ('performer', 'animals-specialty-acts'),
    ('performer', 'sports-fitness'),
    -- cross-cutting: operational-setup fields fit event staff + production
    ('ops',       'event-staff'),
    ('ops',       'production-bts'),
    -- cross-cutting: gear/equipment fields fit DJs, performers, photo, prod
    ('equipment', 'music-djs'),
    ('equipment', 'performers'),
    ('equipment', 'photo-video-creative'),
    ('equipment', 'production-bts'),
    -- cross-cutting: concierge/tour talent does hospitality + hosting work
    ('hosp',      'travel-concierge'),
    ('host',      'travel-concierge')
)
INSERT INTO profile_field_recommendations
  (field_definition_id, taxonomy_term_id, relationship, display_order)
SELECT
  fd.id,
  tt.id,
  'recommended',
  COALESCE(fd.display_order, 100)
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
