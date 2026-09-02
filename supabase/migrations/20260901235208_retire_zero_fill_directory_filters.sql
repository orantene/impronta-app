-- Retire four directory facets that cannot return a result.
--
-- WHY
-- Audit 2026-09-01 (web/docs/directory-profile-engine-audit-2026-09-01.md)
-- measured stored values for every filterable field across all 92 talent
-- profiles. These four are flagged `show_in_directory_filter = true` and have
-- ZERO values platform-wide, so every one of them is a facet a visitor can
-- open and which can only ever return nothing:
--
--   tags · industries · event_types · fit_labels
--
-- `industries` and `fit_labels` are additionally card-visible, so they also
-- occupy two of the four directory-card attribute slots while rendering
-- nothing. Those two card flags are cleared here for the same reason.
--
-- A filter that always returns zero is worse than no filter: it reads as a
-- broken directory rather than an empty one.
--
-- NOT INCLUDED: `languages`. It is also a zero-fill FIELD, but 36 profiles do
-- have real language data — it lives in the `talent_languages` table, not in
-- `talent_profile_field_values`. That facet needs a source repoint in code,
-- not retirement, and is handled separately. Leaving it enabled here on
-- purpose so it is not quietly lost.
--
-- REVERSIBLE. Nothing is deleted: the field definitions, their labels and any
-- stored values remain. To restore a facet once something fills it:
--   UPDATE public.profile_field_definitions
--      SET show_in_directory_filter = true
--    WHERE field_key = '<key>';

UPDATE public.profile_field_definitions
   SET show_in_directory_filter = false,
       updated_at = now()
 WHERE field_key IN ('tags', 'industries', 'event_types', 'fit_labels')
   AND show_in_directory_filter IS TRUE;

UPDATE public.profile_field_definitions
   SET show_in_directory_card = false,
       updated_at = now()
 WHERE field_key IN ('industries', 'fit_labels')
   AND show_in_directory_card IS TRUE;
