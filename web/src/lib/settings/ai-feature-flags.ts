import { createServiceRoleClient } from "@/lib/supabase/admin";
import type { AiProviderId } from "@/lib/ai/provider";

export type AiFeatureFlags = {
  /** Chat / NLU provider (embeddings remain OpenAI). */
  ai_provider: AiProviderId;
  ai_search_enabled: boolean;
  ai_rerank_enabled: boolean;
  ai_explanations_enabled: boolean;
  ai_refine_enabled: boolean;
  ai_draft_enabled: boolean;
  /** Stronger hybrid merge (RRF) + hybrid continuation cursor when set */
  ai_search_quality_v2: boolean;
  /** Richer refine suggestions (Chunk 3) */
  ai_refine_v2: boolean;
  /** Richer explanations (Chunk 4) */
  ai_explanations_v2: boolean;
};

const DEFAULT_FLAGS: AiFeatureFlags = {
  ai_provider: "openai",
  ai_search_enabled: false,
  ai_rerank_enabled: false,
  ai_explanations_enabled: false,
  ai_refine_enabled: false,
  ai_draft_enabled: false,
  ai_search_quality_v2: false,
  ai_refine_v2: false,
  ai_explanations_v2: false,
};

const KEYS = [
  "ai_provider",
  "ai_search_enabled",
  "ai_rerank_enabled",
  "ai_explanations_enabled",
  "ai_refine_enabled",
  "ai_draft_enabled",
  "ai_search_quality_v2",
  "ai_refine_v2",
  "ai_explanations_v2",
] as const;

function asFlag(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (value && typeof value === "object" && "enabled" in (value as object)) {
    return Boolean((value as { enabled?: boolean }).enabled);
  }
  return false;
}

function asAiProvider(value: unknown): AiProviderId {
  if (typeof value === "string") {
    const t = value.trim().toLowerCase();
    if (t === "anthropic") return "anthropic";
  }
  return "openai";
}

/**
 * Reads AI toggles from `public.settings`. Uses service role so keys stay off the public RLS allowlist.
 * When the service role key is missing, returns all **false** (safe default).
 */
export async function getAiFeatureFlags(): Promise<AiFeatureFlags> {
  const supabase = createServiceRoleClient();
  if (!supabase) return { ...DEFAULT_FLAGS };

  const { data, error } = await supabase
    .from("settings")
    .select("key, value")
    .in("key", [...KEYS]);

  if (error || !data) return { ...DEFAULT_FLAGS };

  const map = new Map<string, unknown>();
  for (const row of data) {
    map.set(row.key, row.value);
  }

  return {
    ai_provider: asAiProvider(map.get("ai_provider")),
    ai_search_enabled: asFlag(map.get("ai_search_enabled")),
    ai_rerank_enabled: asFlag(map.get("ai_rerank_enabled")),
    ai_explanations_enabled: asFlag(map.get("ai_explanations_enabled")),
    ai_refine_enabled: asFlag(map.get("ai_refine_enabled")),
    ai_draft_enabled: asFlag(map.get("ai_draft_enabled")),
    ai_search_quality_v2: asFlag(map.get("ai_search_quality_v2")),
    ai_refine_v2: asFlag(map.get("ai_refine_v2")),
    ai_explanations_v2: asFlag(map.get("ai_explanations_v2")),
  };
}
