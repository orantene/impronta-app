import { normalizeSearchQueryForEmbedding } from "@/lib/ai/normalize-search-query";
import { resolveOpenAiApiKey } from "@/lib/ai/resolve-api-keys";

/**
 * Directory hybrid search embeddings use the OpenAI API only. Vector dimensions are fixed in
 * Postgres (`talent_embeddings`); switching embedding providers would require re-indexing.
 * Chat / NLU may use other providers (`resolveAiChatAdapter` in lib/ai/resolve-provider.ts).
 */

/** Matches `talent_embeddings.embedding` dimensions in migrations. */
const EMBEDDING_MODEL = "text-embedding-3-small";

const CACHE_TTL_MS = 12 * 60 * 1000;
const CACHE_MAX = 400;
const cache = new Map<string, { embedding: number[]; exp: number }>();
const inflight = new Map<string, Promise<number[] | null>>();

/**
 * Stable cache key for embeddings and vector-neighbor RPC (bump `IMPRONTA_EMBED_CACHE_GEN` to invalidate).
 */
export function embeddingCacheKey(text: string): string {
  const base = normalizeSearchQueryForEmbedding(text).slice(0, 2000);
  const gen = process.env.IMPRONTA_EMBED_CACHE_GEN?.trim() ?? "1";
  return `${base}\0${gen}`;
}

function cacheGet(key: string): number[] | null {
  const row = cache.get(key);
  if (!row) return null;
  if (Date.now() > row.exp) {
    cache.delete(key);
    return null;
  }
  return row.embedding;
}

function cacheSet(key: string, embedding: number[]): void {
  if (cache.size >= CACHE_MAX) {
    const first = cache.keys().next().value;
    if (first) cache.delete(first);
  }
  cache.set(key, { embedding, exp: Date.now() + CACHE_TTL_MS });
}

/**
 * Server-only: OpenAI embeddings for AI search. Returns null if key missing or request fails.
 * In-memory cache + in-flight dedupe per normalized key (Chunk 6).
 */
export async function embedTextForSearch(text: string): Promise<number[] | null> {
  const normalized = normalizeSearchQueryForEmbedding(text).slice(0, 2000);
  if (!normalized) return null;
  const key = embeddingCacheKey(text);

  const hit = cacheGet(key);
  if (hit) return hit;

  const pending = inflight.get(key);
  if (pending) return pending;

  const promise = embedTextForSearchUncached(text).then((emb) => {
    inflight.delete(key);
    if (emb) cacheSet(key, emb);
    return emb;
  });
  inflight.set(key, promise);
  return promise;
}

async function embedTextForSearchUncached(text: string): Promise<number[] | null> {
  const key = (await resolveOpenAiApiKey())?.trim();
  if (!key) return null;
  const input = text.trim().slice(0, 8000);
  if (!input) return null;

  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input,
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      data?: Array<{ embedding?: number[] }>;
    };
    const emb = json?.data?.[0]?.embedding;
    return Array.isArray(emb) && emb.length > 0 ? emb : null;
  } catch {
    return null;
  }
}

export const OPENAI_EMBEDDING_MODEL_ID = EMBEDDING_MODEL;
