-- Drop the deprecated 'skills' field (2026-06-15).
-- Investigation (workflow agent): all 50 talent_profile_field_values rows for
-- field_key='skills' hold the IDENTICAL seed/placeholder sentence — it is QA
-- placeholder copy, not per-talent skill data, and maps to 0 taxonomy skill terms.
-- No real data to migrate or lose. Archived by 20260615200001. Drop it.
delete from public.profile_field_definitions where field_key = 'skills';
