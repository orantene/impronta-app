import { logAnalyticsEventServer } from "@/lib/analytics/server-log";
import { PRODUCT_ANALYTICS_EVENTS } from "@/lib/analytics/product-events";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export type LogSearchQueryInput = {
  query: string | null;
  filters: Record<string, unknown>;
  resultsCount: number;
  source?: string;
  searchMode?: string | null;
  aiEnabled?: boolean | null;
  rerankEnabled?: boolean | null;
  explanationEnabled?: boolean | null;
  /** Requested retrieval path for hybrid vs classic (`search_queries.ai_path_requested`). */
  aiPathRequested?: string | null;
  /** True when hybrid was eligible/attempted but vector reorder did not apply. */
  fallbackTriggered?: boolean | null;
  /** Short machine reason (`search_queries.fallback_reason`); also mirrored in filters when useful. */
  fallbackReason?: string | null;
  flagSnapshot?: Record<string, unknown>;
  userId?: string | null;
};

/**
 * Best-effort analytics insert. Requires `SUPABASE_SERVICE_ROLE_KEY` on the server.
 * Never throws to callers — failures are swallowed after optional console debug.
 */
export async function logSearchQuery(input: LogSearchQueryInput): Promise<void> {
  const supabase = createServiceRoleClient();
  if (!supabase) return;

  const { error } = await supabase.from("search_queries").insert({
    query: input.query?.trim() || null,
    filters: input.filters,
    results_count: input.resultsCount,
    source: input.source ?? "directory",
    search_mode: input.searchMode ?? "classic",
    ai_enabled: input.aiEnabled ?? false,
    rerank_enabled: input.rerankEnabled ?? false,
    explanation_enabled: input.explanationEnabled ?? false,
    ai_path_requested: input.aiPathRequested ?? null,
    fallback_triggered: input.fallbackTriggered ?? null,
    fallback_reason: input.fallbackReason ?? null,
    flag_snapshot: input.flagSnapshot ?? {},
    user_id: input.userId ?? null,
  });

  if (error && process.env.NODE_ENV === "development") {
    console.warn("[logSearchQuery]", error.message);
  }

  if (!error) {
    const filterCount = Object.keys(input.filters ?? {}).length;
    await logAnalyticsEventServer({
      name: PRODUCT_ANALYTICS_EVENTS.search,
      payload: {
        query_text_length: input.query?.length ?? 0,
        results_count: input.resultsCount,
        filter_count: filterCount,
        source_page: input.source ?? "directory",
      },
    });
  }
}
