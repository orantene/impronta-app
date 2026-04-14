import type { SupabaseClient } from "@supabase/supabase-js";

export type VectorMatchRow = {
  talent_profile_id: string;
  distance: number;
};

export type MatchTalentEmbeddingsResult =
  | { ok: true; rows: VectorMatchRow[] }
  | { ok: false; reason: "rpc_error"; message: string };

/**
 * Calls `match_talent_embeddings` (service-role client).
 * Distinguishes RPC failure (PostgREST / SQL) from an empty index.
 */
export async function matchTalentEmbeddings(
  supabase: SupabaseClient,
  embedding: number[],
  matchCount = 80,
): Promise<MatchTalentEmbeddingsResult> {
  const { data, error } = await supabase.rpc("match_talent_embeddings", {
    p_query_embedding: embedding,
    p_match_count: matchCount,
  });
  if (error) {
    return { ok: false, reason: "rpc_error", message: error.message };
  }
  return { ok: true, rows: (data ?? []) as VectorMatchRow[] };
}

/** Cosine distance from pgvector `<=>`; map to a bounded similarity score for ranking. */
export function cosineDistanceToSimilarity01(distance: number): number {
  const s = 1 - distance;
  if (!Number.isFinite(s)) return 0;
  return Math.min(1, Math.max(0, s));
}

export function mergeClassicItemsByVectorOrder<T extends { id: string }>(
  classic: T[],
  vectorOrderedIds: string[],
): T[] {
  if (vectorOrderedIds.length === 0) return classic;
  const vectorSet = new Set(vectorOrderedIds);
  const byId = new Map(classic.map((c) => [c.id, c] as const));
  const out: T[] = [];
  for (const id of vectorOrderedIds) {
    const c = byId.get(id);
    if (c) out.push(c);
  }
  for (const c of classic) {
    if (!vectorSet.has(c.id)) out.push(c);
  }
  return out;
}
