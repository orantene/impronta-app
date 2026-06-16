-- Drop the deprecated, redundant physical.height_imperial field (2026-06-15).
--
-- Follow-up to 20260615200001 (which held this back pending verification). All 47
-- talents with a physical.height_imperial value ALSO have a canonical
-- talent_profiles.height_cm (verified), so the imperial field is fully redundant —
-- deleting it loses no height data, and the sync_talent_height_gender trigger is a
-- no-op (height_cm already set). The 47 values were archived by 20260615200001
-- into _archive_deprecated_field_values_20260615.
--
-- NOTE: the sibling deprecated field `skills` is deliberately NOT deleted here —
-- 46 of its 50 talents have NO canonical taxonomy skills, so its data is NOT yet
-- superseded. It must be migrated into talent_profile_taxonomy (kind='skill') first.

delete from public.profile_field_definitions where field_key = 'physical.height_imperial';
