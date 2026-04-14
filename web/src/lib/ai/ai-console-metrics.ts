import type { SupabaseClient } from "@supabase/supabase-js";

import { OPENAI_EMBEDDING_MODEL_ID } from "@/lib/ai/openai-embeddings";

export type AiSearchMetricsWindow = {
  label: string;
  hours: number;
  totalSearches: number;
  fallbackCount: number;
  hybridModeCount: number;
  /** Descending by count; empty reasons bucketed as "(empty)". */
  topFallbackReasons: { reason: string; count: number }[];
  /**
   * When true, `topFallbackReasons` comes from `search_queries_fallback_reason_rollup` (full window).
   * When false, counts are from a capped row sample (legacy fallback if RPC missing or errors).
   */
  fallbackReasonsExact: boolean;
};

function startIso(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

async function countSince(
  supabase: SupabaseClient,
  sinceIso: string,
  filter?: { column: string; value: unknown },
): Promise<number> {
  let q = supabase
    .from("search_queries")
    .select("id", { count: "exact", head: true })
    .gte("created_at", sinceIso);
  if (filter) {
    q = q.eq(filter.column, filter.value as string | boolean);
  }
  const { count, error } = await q;
  if (error) return 0;
  return count ?? 0;
}

async function aggregateFallbackReasonsSample(
  supabase: SupabaseClient,
  sinceIso: string,
  sampleCap: number,
  topN: number,
): Promise<{ reason: string; count: number }[]> {
  const { data, error } = await supabase
    .from("search_queries")
    .select("fallback_reason")
    .gte("created_at", sinceIso)
    .eq("fallback_triggered", true)
    .limit(sampleCap);

  if (error || !data?.length) return [];

  const tally = new Map<string, number>();
  for (const row of data as { fallback_reason: string | null }[]) {
    const r = row.fallback_reason?.trim() || "(empty)";
    tally.set(r, (tally.get(r) ?? 0) + 1);
  }
  return [...tally.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, topN);
}

async function aggregateFallbackReasonsRollup(
  supabase: SupabaseClient,
  sinceIso: string,
  limit: number,
): Promise<{ reason: string; count: number }[] | null> {
  const { data, error } = await supabase.rpc("search_queries_fallback_reason_rollup", {
    p_since: sinceIso,
    p_limit: limit,
  });
  if (error || !Array.isArray(data)) return null;
  return (data as { reason: string; cnt: number | string }[]).map((row) => ({
    reason: row.reason,
    count: Number(row.cnt),
  }));
}

/**
 * Staff-only: `search_queries` RLS must allow SELECT for the caller.
 */
export async function loadAiSearchConsoleMetrics(
  supabase: SupabaseClient,
): Promise<{ last24h: AiSearchMetricsWindow; last7d: AiSearchMetricsWindow }> {
  const h24 = startIso(24);
  const d7 = startIso(24 * 7);

  const [
    total24,
    fb24,
    hybrid24,
    total7,
    fb7,
    hybrid7,
    reasons24,
    reasons7,
  ] = await Promise.all([
    countSince(supabase, h24),
    countSince(supabase, h24, { column: "fallback_triggered", value: true }),
    countSince(supabase, h24, { column: "search_mode", value: "hybrid" }),
    countSince(supabase, d7),
    countSince(supabase, d7, { column: "fallback_triggered", value: true }),
    countSince(supabase, d7, { column: "search_mode", value: "hybrid" }),
    aggregateFallbackReasonsRollup(supabase, h24, 12),
    aggregateFallbackReasonsRollup(supabase, d7, 12),
  ]);

  const rollup24 = reasons24;
  const rollup7 = reasons7;
  const exact24 = rollup24 != null;
  const exact7 = rollup7 != null;

  const [final24, final7] = await Promise.all([
    exact24
      ? Promise.resolve(rollup24)
      : aggregateFallbackReasonsSample(supabase, h24, 3000, 12),
    exact7
      ? Promise.resolve(rollup7)
      : aggregateFallbackReasonsSample(supabase, d7, 8000, 12),
  ]);

  const last24h: AiSearchMetricsWindow = {
    label: "Last 24 hours",
    hours: 24,
    totalSearches: total24,
    fallbackCount: fb24,
    hybridModeCount: hybrid24,
    topFallbackReasons: final24,
    fallbackReasonsExact: exact24,
  };

  const last7d: AiSearchMetricsWindow = {
    label: "Last 7 days",
    hours: 24 * 7,
    totalSearches: total7,
    fallbackCount: fb7,
    hybridModeCount: hybrid7,
    topFallbackReasons: final7,
    fallbackReasonsExact: exact7,
  };

  return { last24h, last7d };
}

export type AiTuningEnvSnapshot = {
  improntaRrfClassicWeight: string;
  improntaRrfVectorWeight: string;
  improntaEmbedCacheGen: string;
  improntaVectorNeighborCacheTtlMs: string;
  improntaVectorNeighborCacheMax: string;
  improntaRefineCacheTtlMs: string;
  openaiChatModel: string;
  anthropicChatModel: string;
  aiProviderEnvOverride: string;
  openaiEmbeddingModel: string;
};

export function readAiTuningEnvSnapshot(): AiTuningEnvSnapshot {
  return {
    improntaRrfClassicWeight: process.env.IMPRONTA_RRF_CLASSIC_WEIGHT?.trim() || "(default 1)",
    improntaRrfVectorWeight: process.env.IMPRONTA_RRF_VECTOR_WEIGHT?.trim() || "(default 1.15)",
    improntaEmbedCacheGen: process.env.IMPRONTA_EMBED_CACHE_GEN?.trim() || "(default 1)",
    improntaVectorNeighborCacheTtlMs:
      process.env.IMPRONTA_VECTOR_NEIGHBOR_CACHE_TTL_MS?.trim() || "(default 45000)",
    improntaVectorNeighborCacheMax:
      process.env.IMPRONTA_VECTOR_NEIGHBOR_CACHE_MAX?.trim() || "(default 180)",
    improntaRefineCacheTtlMs:
      process.env.IMPRONTA_REFINE_CACHE_TTL_MS?.trim() || "(default 30000)",
    openaiChatModel: process.env.OPENAI_CHAT_MODEL?.trim() || "gpt-4o-mini",
    anthropicChatModel:
      process.env.ANTHROPIC_CHAT_MODEL?.trim() || "claude-sonnet-4-20250514",
    aiProviderEnvOverride: process.env.AI_PROVIDER?.trim() || "(none — use DB ai_provider)",
    openaiEmbeddingModel: OPENAI_EMBEDDING_MODEL_ID,
  };
}
