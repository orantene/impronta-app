import { fetchDirectoryPage } from "@/lib/directory/fetch-directory-page";
import {
  DIRECTORY_PAGE_SIZE_DEFAULT,
  DIRECTORY_PAGE_SIZE_MAX,
  type DirectoryFieldFacetSelection,
  type DirectorySortValue,
} from "@/lib/directory/types";
import { decodeDirectoryCursor, encodeDirectoryCursor } from "@/lib/directory/cursor";
import { computeHybridContextStamp } from "@/lib/directory/hybrid-context-stamp";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { getPublicSettings } from "@/lib/public-settings";
import { getAiFeatureFlags } from "@/lib/settings/ai-feature-flags";
import { embedTextForSearch, embeddingCacheKey } from "@/lib/ai/openai-embeddings";
import { directoryCardToSearchResult, type SearchResult } from "@/lib/ai/search-result";
import { cosineDistanceToSimilarity01 } from "@/lib/ai/vector-retrieval";
import { matchTalentEmbeddingsCached } from "@/lib/ai/vector-neighbor-cache";
import {
  applyHybridMergeToCards,
  type HybridMergeStrategy,
} from "@/lib/ai/hybrid-merge";
import {
  getMaxClassicFetchHybrid,
  getMaxVectorNeighbors,
} from "@/lib/ai/search-performance-limits";
import { logSearchQuery } from "@/lib/search-queries/log-search-query";
import { canonicalDirectoryQueryForAiSearch } from "@/lib/ai/normalize-search-query";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import {
  parseDirectoryLocation,
  parseDirectoryQuery,
  parseDirectorySort,
} from "@/lib/directory/search-params";
import { applyHybridRerank } from "@/lib/ai/rerank";
import { buildExplanationsForAiSearchCards } from "@/lib/ai/build-ai-search-explanations";
import { publicMatchConfidenceFromExplanations } from "@/lib/ai/match-explain";
import { improntaLog } from "@/lib/server/structured-log";
import type { AiSearchDebugInfo } from "@/lib/ai/ai-search-debug";

export type RunAiDirectorySearchInput = {
  rawQ?: string | null;
  taxonomyTermIds?: string[];
  locationSlug?: string | null;
  sortRaw?: string | null;
  locale?: "en" | "es";
  limit?: number;
  heightMinCm?: number | null;
  heightMaxCm?: number | null;
  /** Public directory `ff` scalar facets (boolean, text enum, canonical gender). */
  fieldFacetFilters?: DirectoryFieldFacetSelection[];
  cursor?: string | null;
  /** When true (first page only), run COUNT for directory toolbar. */
  includeTotalCount?: boolean;
  /**
   * Set false to skip `search_queries` insert (e.g. duplicate from another logger).
   * Pagination (`cursor`) skips logging by default.
   */
  logAnalytics?: boolean;
  /** `search_queries.source` */
  analyticsSource?: string;
  /** Staff-only: attach pipeline debug DTO (never use on public responses). */
  includeDebug?: boolean;
};

export type RunAiDirectorySearchResult = {
  search_mode: "hybrid" | "classic";
  results: SearchResult[];
  next_cursor: string | null;
  taxonomy_term_ids: string[];
  vector_active: boolean;
  note?: string;
  total_count: number | null;
  debug?: AiSearchDebugInfo;
};

const aiSearchInflight = new Map<string, Promise<RunAiDirectorySearchResult>>();

function buildAiSearchDedupeKey(input: RunAiDirectorySearchInput): string {
  const tax = [...(input.taxonomyTermIds ?? [])].map((id) => id.toLowerCase()).sort();
  const loc = parseDirectoryLocation(input.locationSlug ?? undefined);
  const sort = parseDirectorySort(input.sortRaw ?? undefined);
  const canon = canonicalDirectoryQueryForAiSearch(input.rawQ);
  const ff = [...(input.fieldFacetFilters ?? [])]
    .map((f) => ({
      k: f.fieldKey.trim(),
      v: [...new Set(f.values.map((x) => x.trim()).filter(Boolean))].sort(),
    }))
    .filter((x) => x.k && x.v.length)
    .sort((a, b) => a.k.localeCompare(b.k));
  return JSON.stringify({
    q: canon,
    tax,
    loc,
    sort,
    locale: input.locale ?? "en",
    limit: input.limit ?? null,
    hmin: input.heightMinCm ?? null,
    hmax: input.heightMaxCm ?? null,
    ff,
    cursor: input.cursor?.trim() || null,
    log: input.logAnalytics !== false,
    total: Boolean(input.includeTotalCount),
    src: input.analyticsSource ?? "ai_search",
    dbg: Boolean(input.includeDebug),
  });
}

/**
 * Shared hybrid directory search for `POST /api/ai/search` and public directory SSR.
 *
 * Pagination: when `cursor` is set, vector merge is skipped (classic page only).
 * When the first page applies vector reorder and `ai_search_quality_v2` is **off**, `next_cursor`
 * is **null**. When **v2** is on, continuation uses classic ordering from the next offset
 * (see docs/search-modes.md).
 */
export async function runAiDirectorySearch(
  input: RunAiDirectorySearchInput,
): Promise<RunAiDirectorySearchResult> {
  const key = buildAiSearchDedupeKey(input);
  let p = aiSearchInflight.get(key);
  if (!p) {
    p = runAiDirectorySearchOnce(input).finally(() => {
      aiSearchInflight.delete(key);
    });
    aiSearchInflight.set(key, p);
  }
  return p;
}

async function runAiDirectorySearchOnce(
  input: RunAiDirectorySearchInput,
): Promise<RunAiDirectorySearchResult> {
  const wallStart = performance.now();

  const publicSettings = await getPublicSettings();
  if (!publicSettings.directoryPublic) {
    return {
      search_mode: "classic",
      results: [],
      next_cursor: null,
      taxonomy_term_ids: input.taxonomyTermIds ?? [],
      vector_active: false,
      total_count: 0,
    };
  }

  const flags = await getAiFeatureFlags();

  const canonicalQ = canonicalDirectoryQueryForAiSearch(input.rawQ);
  const locationSlug = parseDirectoryLocation(input.locationSlug ?? undefined);
  const sort = parseDirectorySort(input.sortRaw ?? undefined) as DirectorySortValue;
  const taxonomyTermIds = input.taxonomyTermIds ?? [];
  const fieldFacetFilters = input.fieldFacetFilters ?? [];
  const locale = input.locale ?? "en";
  const limit = Math.min(
    Math.max(input.limit ?? DIRECTORY_PAGE_SIZE_DEFAULT, 1),
    DIRECTORY_PAGE_SIZE_MAX,
  );

  const clampCm = (n: number | null | undefined): number | null => {
    if (n == null || !Number.isFinite(n)) return null;
    return Math.min(220, Math.max(140, Math.round(n)));
  };
  let heightMinCm = clampCm(input.heightMinCm);
  let heightMaxCm = clampCm(input.heightMaxCm);
  if (
    heightMinCm != null &&
    heightMaxCm != null &&
    heightMinCm > heightMaxCm
  ) {
    const t = heightMinCm;
    heightMinCm = heightMaxCm;
    heightMaxCm = t;
  }

  const cursorRaw = input.cursor?.trim() || null;
  let cursor = cursorRaw;
  if (cursorRaw) {
    const dec = decodeDirectoryCursor(cursorRaw);
    if (dec?.mode === "classic_after_hybrid" && dec.hybridContextStamp) {
      const expectedStamp = computeHybridContextStamp({
        canonicalQuery: canonicalQ,
        taxonomyTermIds,
        locationSlug,
        sort,
        heightMinCm,
        heightMaxCm,
        fieldFacetFilters,
      });
      if (dec.hybridContextStamp !== expectedStamp) {
        cursor = null;
        void improntaLog("ai_search_cursor_stamp_mismatch", {
          expected_prefix: expectedStamp.slice(0, 6),
          got_prefix: dec.hybridContextStamp.slice(0, 6),
        });
      }
    }
  }
  const skipVector = Boolean(cursor);

  const query =
    flags.ai_search_enabled && canonicalQ.length > 0 && !skipVector
      ? canonicalQ
      : parseDirectoryQuery(input.rawQ ?? undefined);

  const normalizedForEmbedding =
    flags.ai_search_enabled && !skipVector && canonicalQ.length >= 2 ? canonicalQ : null;

  const supabase = createPublicSupabaseClient();
  if (!supabase) {
    return {
      search_mode: "classic",
      results: [],
      next_cursor: null,
      taxonomy_term_ids: taxonomyTermIds,
      vector_active: false,
      total_count: null,
    };
  }

  const searchMode =
    flags.ai_search_enabled ? ("hybrid" as const) : ("classic" as const);

  const vectorEligible =
    !skipVector &&
    flags.ai_search_enabled &&
    Boolean(normalizedForEmbedding && normalizedForEmbedding.trim().length >= 2);

  const fetchLimit = vectorEligible
    ? Math.min(DIRECTORY_PAGE_SIZE_MAX, getMaxClassicFetchHybrid(limit))
    : limit;

  const includeTotalCount = Boolean(input.includeTotalCount && !cursor);

  let page = await fetchDirectoryPage(supabase, {
    limit: fetchLimit,
    cursor: cursor || undefined,
    taxonomyTermIds,
    locale,
    sort,
    query,
    locationSlug,
    heightMinCm,
    heightMaxCm,
    fieldFacetFilters,
    skipTotalCount: !includeTotalCount,
  });

  const classicFetchedCount = page.items.length;

  let vectorActive = false;
  let fallbackReason: string | null = null;
  const vectorScoreByTalentId = new Map<string, number>();
  let vectorNeighborCount = 0;
  let mergeStrategy: HybridMergeStrategy = "classic_only";

  if (vectorEligible) {
    const svc = createServiceRoleClient();
    if (!svc) {
      fallbackReason = "service_role_unconfigured";
    } else if (!process.env.OPENAI_API_KEY?.trim()) {
      fallbackReason = "openai_key_missing";
    } else {
      const emb = await embedTextForSearch(normalizedForEmbedding!);
      if (!emb) {
        fallbackReason = "embedding_failed";
      } else {
        const matchCount = getMaxVectorNeighbors();
        const matchResult = await matchTalentEmbeddingsCached(
          svc,
          emb,
          embeddingCacheKey(normalizedForEmbedding!),
          matchCount,
        );
        if (!matchResult.ok) {
          fallbackReason = "vector_rpc_error";
          void improntaLog("ai_search_vector_rpc_error", {
            message: matchResult.message.slice(0, 240),
          });
          console.warn(
            JSON.stringify({
              event: "ai_search_vector_rpc_error",
              message: matchResult.message.slice(0, 240),
            }),
          );
        } else if (matchResult.rows.length === 0) {
          fallbackReason = "no_vector_matches";
        } else {
          vectorNeighborCount = matchResult.rows.length;
          for (const m of matchResult.rows) {
            vectorScoreByTalentId.set(
              m.talent_profile_id,
              cosineDistanceToSimilarity01(m.distance),
            );
          }
          const vectorIds = matchResult.rows.map((m) => m.talent_profile_id);
          mergeStrategy = flags.ai_search_quality_v2 ? "rrf" : "vector_reorder";
          page = {
            ...page,
            items: applyHybridMergeToCards(page.items, vectorIds, mergeStrategy),
          };
          vectorActive = true;
          fallbackReason = null;
        }
      }
    }
  }

  if (!vectorActive) {
    mergeStrategy = "classic_only";
    if (fallbackReason == null) {
      if (!flags.ai_search_enabled) {
        fallbackReason = "ai_search_disabled";
      } else if (skipVector) {
        fallbackReason = "pagination_skip_vector";
      } else if (!normalizedForEmbedding) {
        fallbackReason =
          canonicalQ.trim().length > 0 ? "query_too_short" : "empty_or_whitespace_query";
      }
    }
  }

  const postMergeCount = page.items.length;

  const slicedItems = page.items.slice(0, limit);

  const explainMap =
    flags.ai_explanations_enabled && slicedItems.length > 0
      ? await buildExplanationsForAiSearchCards(supabase, slicedItems, {
          locale,
          locationSlug,
          taxonomyTermIds,
          heightMinCm,
          heightMaxCm,
          canonicalQuery: canonicalQ,
          explanationsV2: flags.ai_explanations_v2,
        })
      : null;

  let results = slicedItems.map((card) => {
    const vecScore = vectorScoreByTalentId.get(card.id);
    const explanation = explainMap?.get(card.id) ?? [];
    const confidence =
      flags.ai_explanations_enabled &&
      flags.ai_explanations_v2 &&
      explanation.length > 0
        ? publicMatchConfidenceFromExplanations(explanation, locale)
        : null;
    return directoryCardToSearchResult(card, {
      score: vecScore ?? null,
      ranking_signals:
        vectorActive && vecScore != null
          ? {
              vector_similarity: vecScore,
              ranking_signals_version: "1.0",
            }
          : null,
      explanation,
      confidence,
    });
  });

  if (flags.ai_rerank_enabled && vectorActive) {
    results = applyHybridRerank(results);
  }

  let nextCursor: string | null;
  if (vectorActive && !cursor && !flags.ai_search_quality_v2) {
    nextCursor = null;
  } else if (
    vectorActive &&
    !cursor &&
    flags.ai_search_quality_v2 &&
    results.length > 0
  ) {
    nextCursor = encodeDirectoryCursor({
      offset: limit,
      mode: "classic_after_hybrid",
      hybridContextStamp: computeHybridContextStamp({
        canonicalQuery: canonicalQ,
        taxonomyTermIds,
        locationSlug,
        sort,
        heightMinCm,
        heightMaxCm,
        fieldFacetFilters,
      }),
    });
  } else {
    nextCursor = page.nextCursor ?? null;
  }

  const queryForLog =
    flags.ai_search_enabled && canonicalQ.length > 0 ? canonicalQ : query.trim() || null;

  const vectorStageAttempted =
    flags.ai_search_enabled &&
    !skipVector &&
    Boolean(normalizedForEmbedding && normalizedForEmbedding.trim().length >= 2);

  const fallbackTriggered = vectorStageAttempted && !vectorActive;

  if (fallbackTriggered) {
    void improntaLog("ai_search_fallback", {
      fallback_reason: fallbackReason,
      search_mode: searchMode,
      query_len: normalizedForEmbedding?.length ?? 0,
    });
    console.warn(
      JSON.stringify({
        event: "ai_search_fallback",
        fallback_reason: fallbackReason,
        search_mode: searchMode,
        query_len: normalizedForEmbedding?.length ?? 0,
      }),
    );
  }

  const vecScores = results
    .map((r) => r.score)
    .filter((s): s is number => s != null && Number.isFinite(s));
  const vectorScoreSummary =
    vecScores.length > 0
      ? {
          min: Math.min(...vecScores),
          max: Math.max(...vecScores),
          avg: vecScores.reduce((a, b) => a + b, 0) / vecScores.length,
        }
      : null;

  void improntaLog("ai_search_pipeline", {
    vector_active: vectorActive,
    merge_strategy: mergeStrategy,
    fallback_reason: fallbackReason,
    classic_fetched: classicFetchedCount,
    vector_neighbors: vectorNeighborCount,
    post_merge: postMergeCount,
    results_returned: results.length,
    wall_time_ms: Math.round(performance.now() - wallStart),
    quality_v2: flags.ai_search_quality_v2,
  });

  const shouldLog = input.logAnalytics !== false && !cursor;
  if (shouldLog) {
    void logSearchQuery({
      query: queryForLog,
      filters: {
        taxonomyTermIds,
        locationSlug,
        sort,
        heightMinCm,
        heightMaxCm,
        vector_active: vectorActive,
        fallback_reason: fallbackReason,
        merge_strategy: mergeStrategy,
        candidate_counts: {
          classic_fetched: classicFetchedCount,
          vector_neighbors: vectorNeighborCount,
          post_merge: postMergeCount,
        },
      },
      resultsCount: results.length,
      source: input.analyticsSource ?? "ai_search",
      searchMode,
      aiEnabled: flags.ai_search_enabled,
      rerankEnabled: flags.ai_rerank_enabled,
      explanationEnabled: flags.ai_explanations_enabled,
      aiPathRequested: flags.ai_search_enabled ? "hybrid" : "classic",
      fallbackTriggered,
      fallbackReason,
      flagSnapshot: {
        ...flags,
        normalized_query: normalizedForEmbedding,
        canonical_query: canonicalQ.length > 0 ? canonicalQ : null,
        vector_active: vectorActive,
        fallback_reason: fallbackReason,
        merge_strategy: mergeStrategy,
        candidate_counts: {
          classic_fetched: classicFetchedCount,
          vector_neighbors: vectorNeighborCount,
          post_merge: postMergeCount,
        },
        wall_time_ms: Math.round(performance.now() - wallStart),
        vector_rpc_error_detail:
          fallbackReason === "vector_rpc_error"
            ? "see server logs (ai_search_vector_rpc_error)"
            : null,
      },
    });
  }

  const wallMs = Math.round(performance.now() - wallStart);

  const debug: AiSearchDebugInfo | undefined = input.includeDebug
    ? {
        merge_strategy: mergeStrategy,
        fallback_reason: fallbackReason,
        vector_active: vectorActive,
        candidate_counts: {
          classic_fetched: classicFetchedCount,
          vector_neighbors: vectorNeighborCount,
          post_merge: postMergeCount,
        },
        vector_score_summary: vectorScoreSummary,
        wall_time_ms: wallMs,
      }
    : undefined;

  return {
    search_mode: searchMode,
    results,
    next_cursor: nextCursor,
    taxonomy_term_ids: page.taxonomyTermIds,
    vector_active: vectorActive,
    note:
      flags.ai_search_enabled && !vectorActive && fallbackReason
        ? `Classic ordering; vector stage skipped (${fallbackReason}).`
        : undefined,
    total_count: includeTotalCount ? (page.totalCount ?? null) : null,
    ...(debug ? { debug } : {}),
  };
}
