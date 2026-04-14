# Search result DTO (`SearchResult`)

Shared contract for **classic directory**, **vector**, **re-rank**, **explain**, **refine**, and **UI**.

## JSON fields

| Field | Type | Notes |
|-------|------|--------|
| `talent_id` | UUID | `talent_profiles.id` |
| `score` | number \| null | Similarity or combined rank score; null for classic-only |
| `ranking_signals` | object \| null | Structured breakdown for debug/admin (optional on public) |
| `explanation` | array | Items: `code`, `templateParams`, `confidence` (see `match_explanations.md`) |
| `confidence` | string \| null | Aggregate hint for UI |
| `highlight` | string \| null | Snippet for query hit |
| `card` | object | **Current app:** embed `DirectoryCardDTO` fields for list rendering |

## Versioning

Breaking changes require API versioning or `docs/decision-log.md` + consumer updates (see plan hard rules §1).

## Cache keys (server)

Must include: `search_mode`, flag snapshot or hash, canonical filters, locale — do not mix classic vs AI cache entries.
