import type { HybridMergeStrategy } from "@/lib/ai/hybrid-merge";

/** Staff-only diagnostics for search pipeline (never expose on public JSON). */
export type AiSearchDebugInfo = {
  merge_strategy: HybridMergeStrategy;
  fallback_reason: string | null;
  vector_active: boolean;
  candidate_counts: {
    classic_fetched: number;
    vector_neighbors: number;
    post_merge: number;
  };
  vector_score_summary: {
    min: number | null;
    max: number | null;
    avg: number | null;
  } | null;
  wall_time_ms: number;
};
