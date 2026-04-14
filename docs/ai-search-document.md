# AI search document (`ai_search_document`)

## Purpose

One **deterministic** plain-text document per talent profile used **only** for:

- Embedding generation (Phase 9+)
- Optional admin “preview what search sees”

Do **not** concatenate ad-hoc strings at embedding call sites.

## Builder

Implementation: `web/src/lib/ai/build-ai-search-document.ts`.

## Rules

1. **Stable section order** — same code version + same DB state ⇒ identical string.
2. **Labels** — fixed English labels (or documented i18n policy); no random wording per run.
3. **Empty sections** — omit line entirely (configurable; current code uses **omit**).
4. **Inputs**
   - `display_name`, `first_name`, `last_name`
   - Primary `talent_type` and other taxonomy terms (from provided lists)
   - Residence location display string (from `residence_city_id`)
   - `height_cm` when present
   - `gender` when the `field_definitions` row for key `gender` has `ai_visible: true` (value from `talent_profiles.gender`)
   - `short_bio`, `bio_en` (and `bio_es` if passed)
   - `field_values` rows joined to definitions with `ai_visible: true` (respecting `public_visible` + `profile_visible`)
5. **Exclusions** — no `internal_only` fields; no raw JSON dumps; no PII not already on profile (e.g. internal notes).

## Regeneration

**Runtime persistence:** `web/src/lib/ai/rebuild-ai-search-document.ts` loads profile + taxonomy + AI-visible field values, calls `buildAiSearchDocument()`, and writes `talent_profiles.ai_search_document`. It is invoked via `scheduleRebuildAiSearchDocument` after profile edits, taxonomy changes, field value saves, bio translation updates, onboarding, and related flows.

**Backfill:** `npm run rebuild-ai-documents` (from `web/`), then `npm run embed-talents` to refresh `talent_embeddings`.

DB triggers (`supabase/migrations/20260416150000_embedding_invalidation_triggers.sql` and `20260413150000_embedding_invalidation_field_values.sql`) delete stale embedding rows when source data changes.

## Persistence

Migration **`20260415140000_talent_profiles_ai_search_document.sql`** adds nullable `talent_profiles.ai_search_document`. Use **`hashAiSearchDocument`** (`web/src/lib/ai/ai-search-document-hash.ts`) for `talent_embeddings.document_hash` alignment with `embed-talents.mjs`.
