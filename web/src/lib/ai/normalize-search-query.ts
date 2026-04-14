import { parseDirectoryQuery } from "@/lib/directory/search-params";

/**
 * Normalize free text before embedding / analytics keys (plan §3).
 * **`canonicalDirectoryQueryForAiSearch`** is the single entry for hybrid search, refine
 * suggestions (`/api/ai/refine-suggestions`), and eval harnesses — do not duplicate trim/NFKC
 * rules elsewhere without updating this module.
 */
export function normalizeSearchQueryForEmbedding(raw: string): string {
  let s = raw.normalize("NFKC").trim().toLowerCase();
  s = s.replace(/\s+/g, " ");
  return s;
}

/**
 * Single pipeline for `/api/ai/search` when hybrid is on: trim (directory rules) → NFKC / case / spaces.
 * Use the same string for FTS `fetchDirectoryPage` and for embedding so the classic and vector legs align.
 */
export function canonicalDirectoryQueryForAiSearch(
  raw: string | null | undefined,
): string {
  const trimmed = parseDirectoryQuery(raw ?? undefined);
  if (!trimmed) return "";
  return normalizeSearchQueryForEmbedding(trimmed);
}
