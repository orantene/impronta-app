# Database audit — Impronta

**Policy:** Forward-only fixes for already-applied migrations; do not rewrite history in production.

## Migration chain

Migrations live in `supabase/migrations/` from `20250409000000_init.sql` through directory performance and commercial extensions. Review is **chronological**; duplicate intent (e.g. column add/drop/re-add) is noted as historical debt only.

## Indexes (directory hot path)

| Area | Status |
|------|--------|
| Public directory partial index on `talent_profiles (workflow_status, visibility, deleted_at)` | Present in init (`idx_talent_profiles_public_list`). |
| `talent_profile_taxonomy (taxonomy_term_id, talent_profile_id)` | Added in `20260414120000_directory_performance_search.sql`. |
| `talent_profiles (profile_code)` | UNIQUE implies index. |
| `locations (country_code, city_slug)` | UNIQUE in init. |
| Admin list by `workflow_status` / `visibility` without public partials | **Verify** with `EXPLAIN` on slow queries; add non-partial btree if needed. |
| Inquiries | `idx_inquiries_client_created`, `idx_inquiries_guest_created` (`20260408110100`). |

## `search_queries` (Phase C)

After migration `20260415103000_search_queries_ai_embeddings.sql`:

| Column | Notes |
|--------|--------|
| `query`, `filters`, `results_count`, `source`, `created_at` | Core analytics. |
| `search_mode`, `ai_enabled`, `rerank_enabled`, `explanation_enabled` | AI segmentation (nullable for legacy). |
| `intent`, `fallback_triggered`, `fallback_reason`, `flag_snapshot` | Optional forward fields. |

Index recommendation when volume grows: `(created_at DESC)`; optional partial on `source`.

## RLS matrix (summary)

| Resource | Public anon | Talent owner | Staff |
|----------|-------------|--------------|-------|
| `talent_profiles` | Approved + public only | Own row | Full read/update |
| `talent_profile_taxonomy` | Follows parent profile | Own profile | Staff write |
| `media_assets` | Approved variants on public profile | Own | Staff |
| `field_values` / catalog | Field-level policies | Own profile | Staff |
| `inquiries` / `inquiry_talent` | Guest/client insert paths via RPC | Own inquiries | Staff |
| `settings` | Whitelisted keys only | — | Staff write |
| `search_queries` | Insert (logging) | Insert | Staff read |

## Gaps / follow-ups

1. Run `EXPLAIN (ANALYZE, BUFFERS)` on worst admin talent list + inquiry list in staging; file issues for missing indexes.
2. Confirm `directory_search_public_talent_ids` is deployed everywhere; remove legacy fallback when safe (`DIRECTORY_SEARCH_FORCE_LEGACY`).
3. Re-validate RLS after any new table touching PII.
