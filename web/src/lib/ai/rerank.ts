import type { SearchResult } from "@/lib/ai/search-result";

/**
 * Deterministic tie-break per `docs/ranking_signals.md` §4 (when final soft scores tie).
 */
function compareDeterministicRankingTieBreak(a: SearchResult, b: SearchResult): number {
  const ca = a.card;
  const cb = b.card;
  if (ca.featuredPosition !== cb.featuredPosition) return ca.featuredPosition - cb.featuredPosition;
  const comp = Number(cb.profileCompletenessScore) - Number(ca.profileCompletenessScore);
  if (comp !== 0) return comp;
  if (ca.isFeatured !== cb.isFeatured) return (cb.isFeatured ? 1 : 0) - (ca.isFeatured ? 1 : 0);
  if (ca.featuredLevel !== cb.featuredLevel) return cb.featuredLevel - ca.featuredLevel;
  if (ca.createdAt !== cb.createdAt) return cb.createdAt.localeCompare(ca.createdAt);
  return a.talent_id.localeCompare(b.talent_id);
}

function hasManualOverride(r: SearchResult): boolean {
  return r.card.manualRankOverride != null;
}

/**
 * Phase 10: soft score from vector similarity + small boosts, then §4 tie-break.
 * `manual_rank_override` (§5) sorts before AI-derived ordering among curated rows.
 */
function hybridSoftScore(r: SearchResult): number {
  const base = r.score ?? 0;
  const featuredBoost = (r.card.isFeatured ? 0.02 : 0) + r.card.featuredLevel * 0.003;
  const completenessBoost = Number(r.card.profileCompletenessScore ?? 0) * 0.0005;
  return base + featuredBoost + completenessBoost;
}

/**
 * Re-order after hybrid vector merge when `ai_rerank_enabled` is on (caller gates).
 */
export function applyHybridRerank(results: SearchResult[]): SearchResult[] {
  return [...results].sort((a, b) => {
    const am = hasManualOverride(a);
    const bm = hasManualOverride(b);
    if (am !== bm) return am ? -1 : 1;

    if (am && bm) {
      const d = (a.card.manualRankOverride ?? 0) - (b.card.manualRankOverride ?? 0);
      if (d !== 0) return d;
      return compareDeterministicRankingTieBreak(a, b);
    }

    const sa = hybridSoftScore(a);
    const sb = hybridSoftScore(b);
    if (sb !== sa) return sb - sa;
    return compareDeterministicRankingTieBreak(a, b);
  });
}
