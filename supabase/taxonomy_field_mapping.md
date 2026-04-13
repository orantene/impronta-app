# Taxonomy Field Mapping

This pack keeps the existing `public.taxonomy_terms` model and expands term coverage for the current enum-based kinds on `public.taxonomy_kind`.

## Core Rules

- There is no `taxonomy_kinds` table; kinds are stored in `public.taxonomy_terms.kind`.
- Taxonomy-backed profile selections belong in `public.talent_profile_taxonomy`.
- Scalar profile values belong in `public.field_values`.
- Canonical profile location still belongs in `public.talent_profiles.location_id`.
- `location_city` and `location_country` should remain derived mirrors for filtering/admin organization, not a second source of truth for profile location.

## Field Audit

| field key | field label | value_type | taxonomy kind | current status | action needed |
| --- | --- | --- | --- | --- | --- |
| `talent_type` | Talent Type | `taxonomy_single` | `talent_type` | Correctly wired in field seed migration | No schema action; import richer terms |
| `tags` | Tags | `taxonomy_multi` | `tag` | Correctly wired in field seed migration | No schema action; import richer terms |
| `skills` | Skills | `taxonomy_multi` | `skill` | Correctly wired in field seed migration | No schema action; import richer terms |
| `industries` | Industries | `taxonomy_multi` | `industry` | Correctly wired in field seed migration | No schema action; import richer terms |
| `event_types` | Event Types | `taxonomy_multi` | `event_type` | Correctly wired in field seed migration | No schema action; import richer terms |
| `fit_labels` | Fit Labels | `taxonomy_multi` | `fit_label` | Correctly wired in field seed migration | No schema action; import richer terms |
| `languages` | Languages | `taxonomy_multi` | `language` | Correctly wired in field seed migration | No schema action; import richer terms |
| `location` | Location | `location` | `NULL` | Intentionally canonical, stored on `talent_profiles.location_id` | Keep canonical model; do not convert to taxonomy-backed editing |

## Current Wiring Notes

- The main taxonomy-backed editing surfaces are already aligned with the field system in [20260409094500_field_system_core.sql](/Users/oranpersonal/Desktop/impronta-app/supabase/migrations/20260409094500_field_system_core.sql).
- Talent dashboard loading explicitly excludes `location_city` and `location_country` from editable taxonomy fields in [talent-dashboard-data.ts](/Users/oranpersonal/Desktop/impronta-app/web/src/lib/talent-dashboard-data.ts#L239).
- Directory field-driven filters also exclude `location_city` and `location_country` to avoid competing with canonical location filters in [field-driven-filters.ts](/Users/oranpersonal/Desktop/impronta-app/web/src/lib/directory/field-driven-filters.ts#L72).

## Location Taxonomy Guidance

The location taxonomy kinds are valid and useful, but they should stay secondary:

- Profile editing should keep using `talent_profiles.location_id`.
- Merchandising and admin taxonomy browsing can use `location_city` and `location_country`.
- If the canonical `locations` table is expanded, `public.sync_location_taxonomy_terms()` should remain the preferred way to keep location taxonomy synchronized.

## Recommended Launch Minimum

Use the lean set first in Admin → Taxonomy to keep taxonomy management understandable:

- `talent_type`: 16 launch terms
- `tag`: 15 launch terms
- `skill`: 16 launch terms
- `industry`: 15 launch terms
- `event_type`: 15 launch terms
- `fit_label`: 10 launch terms
- `language`: 8 launch terms
- `location_country`: 2 launch terms
- `location_city`: 3 launch terms

## Full Extended QA Set

Load the full pack when you want broader QA/demo coverage:

- richer admin taxonomy browsing
- fewer missing options while editing profiles
- better support for seed/demo personas
- broader future discovery/filter experimentation without another taxonomy pass
