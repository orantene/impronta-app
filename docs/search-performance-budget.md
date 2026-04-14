# Search performance budget

Targets and **hard caps** for directory hybrid search. Enforced in code via [`web/src/lib/ai/search-performance-limits.ts`](../web/src/lib/ai/search-performance-limits.ts) (override with env where noted).

## Latency (targets)

| Stage | Target |
|-------|--------|
| End-to-end `POST /api/ai/search` (warm, median) | 400–600 ms |
| Embedding call | bounded by OpenAI; avoid duplicate calls (Chunk 6 cache) |
| Vector RPC | sub-100 ms typical on small k; scale k carefully |

## Candidate caps

| Parameter | Default | Env override |
|-----------|---------|----------------|
| Max ANN neighbors (`p_match_count`) | 100 | `IMPRONTA_SEARCH_MAX_VECTOR_K` |
| Max classic fetch (hybrid window) | 72 | `IMPRONTA_SEARCH_MAX_CLASSIC_FETCH` |
| Max refine suggestions (API) | 12 | — |
| Max explanations per request (cards) | same as page size | — |

## RRF weights (`ai_search_quality_v2`)

| Variable | Default | Env |
|----------|---------|-----|
| Classic leg weight | `1` | `IMPRONTA_RRF_CLASSIC_WEIGHT` |
| Vector leg weight | `1.15` | `IMPRONTA_RRF_VECTOR_WEIGHT` |

## Fallback

- Skip vector stage when **query shorter than** embed threshold (see normalization), **flags off**, **service/OpenAI missing**, **RPC error**, **empty neighbors**, or **explicit pagination cursor** (classic continuation).
- Optional: skip vector when latency budget exceeded (future hook).

## Related

- [docs/search-modes.md](search-modes.md) — cursor / hybrid continuation
- [docs/ai-api-efficiency.md](ai-api-efficiency.md) — when added (Chunk 6)
