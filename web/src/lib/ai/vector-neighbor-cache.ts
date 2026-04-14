import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  MatchTalentEmbeddingsResult,
  VectorMatchRow,
} from "@/lib/ai/vector-retrieval";
import { matchTalentEmbeddings } from "@/lib/ai/vector-retrieval";

const TTL_MS = Number.parseInt(process.env.IMPRONTA_VECTOR_NEIGHBOR_CACHE_TTL_MS ?? "45000", 10);
const MAX_ENTRIES = Number.parseInt(process.env.IMPRONTA_VECTOR_NEIGHBOR_CACHE_MAX ?? "180", 10);
const ttl = Number.isFinite(TTL_MS) && TTL_MS > 0 ? TTL_MS : 45_000;
const maxEntries = Number.isFinite(MAX_ENTRIES) && MAX_ENTRIES > 0 ? MAX_ENTRIES : 180;

const cache = new Map<string, { rows: VectorMatchRow[]; exp: number }>();
const inflight = new Map<string, Promise<MatchTalentEmbeddingsResult>>();

function prune() {
  const now = Date.now();
  for (const [k, v] of cache) {
    if (now > v.exp) cache.delete(k);
  }
  while (cache.size > maxEntries) {
    const first = cache.keys().next().value;
    if (first === undefined) break;
    cache.delete(first);
  }
}

/**
 * Short-TTL cache for `match_talent_embeddings` keyed by normalized query + match count.
 * Same embedding input → same neighbors; avoids duplicate RPC under burst traffic (Chunk 6).
 */
export function matchTalentEmbeddingsCached(
  supabase: SupabaseClient,
  embedding: number[],
  normalizedQueryKey: string,
  matchCount: number,
): Promise<MatchTalentEmbeddingsResult> {
  const key = `${normalizedQueryKey}\0${matchCount}`;
  prune();

  const hit = cache.get(key);
  if (hit && Date.now() <= hit.exp) {
    return Promise.resolve({ ok: true, rows: hit.rows });
  }

  const pending = inflight.get(key);
  if (pending) return pending;

  const promise = matchTalentEmbeddings(supabase, embedding, matchCount).then((res) => {
    inflight.delete(key);
    if (res.ok) {
      cache.set(key, { rows: res.rows, exp: Date.now() + ttl });
      prune();
    }
    return res;
  });
  inflight.set(key, promise);
  return promise;
}
