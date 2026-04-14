# AI API efficiency (Chunk 6)

Ways the app limits duplicate work, latency, and token spend. Complements [search-performance-budget.md](search-performance-budget.md).

## Client debouncing

- **Directory hybrid search:** When the listing uses `POST /api/ai/search`, the infinite grid debounces free-text query changes (`AI_SEARCH_DEBOUNCE_MS_DEFAULT` in `web/src/lib/ai/search-debounce.ts`) so rapid typing does not emit one embedding request per keystroke.

## Embedding cache

- **Query embeddings:** `embedTextForSearch` uses an in-memory TTL cache and in-flight deduplication for identical normalized strings (see `web/src/lib/ai/openai-embeddings.ts`).
- **Cache generation:** Set `IMPRONTA_EMBED_CACHE_GEN` (any string change) to invalidate in-process embedding keys after you change models or normalization; the same suffix is used for the vector-neighbor cache key.

## Vector neighbor cache

- **`match_talent_embeddings`:** `matchTalentEmbeddingsCached` (`web/src/lib/ai/vector-neighbor-cache.ts`) adds a short TTL (default 45s, `IMPRONTA_VECTOR_NEIGHBOR_CACHE_TTL_MS`) and in-flight coalescing keyed by embedding cache key + match count. Caps via `IMPRONTA_VECTOR_NEIGHBOR_CACHE_MAX`.

## In-process request coalescing

- **AI directory search:** Identical `runAiDirectorySearch` inputs in flight share one promise (same Node instance).
- **Refine suggestions:** `POST /api/ai/refine-suggestions` uses a short TTL cache (`IMPRONTA_REFINE_CACHE_TTL_MS`, `IMPRONTA_REFINE_CACHE_MAX`) keyed by normalized query, filters, and refine v2 flag.

## Server limits

- Vector neighbor cap and classic fetch window: `web/src/lib/ai/search-performance-limits.ts` and env overrides documented in the performance budget doc.
- **Refine:** Suggestion count capped via `MAX_REFINE_SUGGESTIONS_RETURN`.
- **Inquiry draft:** Prompt constraints + `max_tokens`; post-processing guardrails strip risky pricing/availability patterns (`web/src/lib/ai/inquiry-draft-guardrails.ts`).
- **Middleware (per IP / minute):** `POST /api/ai/search` 180; `POST /api/ai/refine-suggestions` 90; `POST /api/admin/ai/search-debug` 45 (staff replay endpoint).

## Caching policy for merged results

- **Do not** cache the same bucket for classic-only and hybrid responses under one key; namespace by path + flags + filter set (see Chunk 6 plan). Full merged-result caching is optional and must respect that split.

## Invalidation

- Embedding cache invalidation on pipeline changes: document version bumps in [ai-refresh-strategy.md](ai-refresh-strategy.md) and the decision log.

## Future metrics

- Target observability: embedding calls per 1k searches, cache hit rate, dedupe rate — surface in AI Console when wired.
