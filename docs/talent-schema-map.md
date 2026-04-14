# Talent schema map

Maps **`talent_profiles`** scalars, **`field_definitions`** flags, and **`field_values`** usage for **public**, **search/directory**, **admin**, and **AI** prep.

## `talent_profiles` core columns (operational)

| Column | Typical use |
|--------|-------------|
| `id`, `profile_code`, `public_slug_part` | Identity, URLs |
| `user_id` | Owner link |
| `display_name`, `first_name`, `last_name` | Display |
| `short_bio`, `bio_en`, `bio_es` | Copy (multilingual) |
| `workflow_status`, `visibility` | Lifecycle + discovery |
| `is_featured`, `featured_level`, `featured_position`, `featured_until`, `listing_started_at` | Merchandising |
| `membership_tier`, `membership_status` | Monetization |
| `profile_completeness_score`, `manual_rank_override` | Ranking |
| `location_id`, `residence_city_id`, `origin_city_id`, `origin_country_id` | Geography (canonical locations) |
| `height_cm`, `gender` | Structured + filters |
| `phone`, `date_of_birth` | Identity / admin (not all public) |
| `deleted_at`, `created_at`, `updated_at` | Soft delete + audit |

**Note:** `nationality` was **removed** (`20260410000000_drop_talent_profiles_nationality.sql`). Do not reference it in new code.

## `field_definitions` flags (per key)

Each row includes:

- **`public_visible`** — may appear on public surfaces (subject to RLS).
- **`internal_only`** — staff-only; never public.
- **`card_visible`** — directory card trait lines (with catalog rules).
- **`profile_visible`** — public profile sections.
- **`filterable`** — directory/admin filters.
- **`searchable`** — text/attribute search participation.
- **`ai_visible`** — included in `ai_search_document` builder (`web/src/lib/ai/build-ai-search-document.ts`).

**Source of truth:** database rows; this doc describes dimensions — **refresh** by querying `field_definitions` after admin changes.

## `field_values`

Typed columns (`value_text`, `value_number`, `value_boolean`, `value_date`, taxonomy FKs as designed) per definition `value_type`.

## Taxonomy

`talent_profile_taxonomy` links profiles to `taxonomy_terms` (`kind`, `slug`, localized names). Primary talent type: `is_primary` + `kind = 'talent_type'`.

## AI search document

Canonical plain-text for embeddings is built only via **`buildAiSearchDocument`** — see `docs/ai-search-document.md`.
