-- ============================================================================
-- 20260923080000_dedup_travel_willing.sql
--
-- Catalog hygiene: `travel.willing` and `travel.willing_to_travel` are a
-- literal duplicate — same label ("Willing to travel"), same tier
-- (global), same travel.* namespace. Confirmed usage:
--   travel.willing            -> 4 talent_profile_field_values rows (in use)
--   travel.willing_to_travel  -> 0 rows (unused dup)
--
-- Deprecate the UNUSED key (travel.willing_to_travel). No data migration
-- needed (zero values). Soft-deprecate via deprecated_at so the resolver
-- (which filters `deprecated_at IS NULL`) drops it from every surface
-- without a destructive delete.
-- ============================================================================

UPDATE profile_field_definitions
SET deprecated_at = now()
WHERE field_key = 'travel.willing_to_travel'
  AND deprecated_at IS NULL;
