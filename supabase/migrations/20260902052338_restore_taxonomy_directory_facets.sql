-- REVERT of 20260901235208_retire_zero_fill_directory_filters.sql.
--
-- WHAT WENT WRONG
-- That migration retired four directory facets — tags, industries, event_types,
-- fit_labels — on the evidence that they had zero rows in
-- `talent_profile_field_values`. That evidence was measured against the WRONG
-- STORE. All four are TAXONOMY facets (`value_type: taxonomy_multi` in the
-- directory field catalog registry); their values live in
-- `talent_profile_taxonomy`, not in the scalar field-value table.
--
-- Re-measured against the correct store:
--
--   industry     31 terms   117 assignments   19 profiles   ← working facet
--   event_type   53 terms   234 assignments   18 profiles   ← working facet
--   fit_label    27 terms     7 assignments    4 profiles   ← thin, alive
--   tag         210 terms     6 assignments    4 profiles   ← thin, alive
--
-- So two genuinely useful facets and two thin ones were switched off, and
-- `industries` + `fit_labels` additionally lost their directory-card slot. This
-- restores all six flags to their pre-migration state.
--
-- It also corrects a claim in the 2026-09-01 audit: the Noir template's
-- "Select clients" band, which derives from `industries`, was reported as
-- rendering for nobody. It renders for the 19 profiles that have industries.
--
-- THE LESSON, recorded so the next pass does not repeat it: a facet's fill rate
-- must be measured against the store its `value_type` names. Scalar facets read
-- `talent_profile_field_values`; taxonomy facets read `talent_profile_taxonomy`.
-- `scripts/check-dead-facets.mjs` is corrected in the same commit.
--
-- `languages` is NOT restored here — it was deliberately left enabled by the
-- previous migration and remains so. It is separately broken in a different
-- way: it is declared `taxonomy_kind: "language"` and there are ZERO
-- taxonomy_terms of that kind, while 108 real rows across 36 profiles sit in
-- `talent_languages`. That facet needs a source repoint in code.

UPDATE public.profile_field_definitions
   SET show_in_directory_filter = true,
       updated_at = now()
 WHERE field_key IN ('tags', 'industries', 'event_types', 'fit_labels');

UPDATE public.profile_field_definitions
   SET show_in_directory_card = true,
       updated_at = now()
 WHERE field_key IN ('industries', 'fit_labels');
