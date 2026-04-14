# Search modes (Phase 8.7)

## Values

| `search_mode` | Meaning |
|---------------|---------|
| `classic` | SQL/FTS directory path |
| `vector` | Embedding ANN only |
| `hybrid` | Combined (policy in API) |
| `shortlist` | Scoped to shortlist |
| `saved` | Saved query / list |
| `manual` | Staff-curated ordering |

Log on `search_queries` with `ai_enabled`, `rerank_enabled`, `explanation_enabled`, `flag_snapshot` where applicable.

## Hybrid pagination and cursor (`ai_search_quality_v2`)

| Cursor payload | Meaning |
|----------------|---------|
| Legacy `{ "o": number }` | Classic `OFFSET` only |
| `{ "v": 2, "o": number, "m": "h1", "h"?: string }` | **`classic_after_hybrid`**: page 2+ uses **classic** ordering from offset `o` after a hybrid first page. Optional **`h`** is a **context stamp** (query + filters + sort + height); a mismatch **drops** the cursor so the listing restarts at offset 0 (avoids wrong continuation after filter edits). |

When **`ai_search_quality_v2`** is **off** and the first page used vector reorder, **`next_cursor`** is **`null`** (no further pages in that semantic slice).

## Client contract

Same **`SearchResult` DTO** across modes — see `search-result-dto.md`.
