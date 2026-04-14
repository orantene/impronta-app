import type { DirectoryCardDTO } from "@/lib/directory/types";
import { mergeClassicItemsByVectorOrder } from "@/lib/ai/vector-retrieval";

const RRF_K = 60;

/** Tunable RRF leg weights (hybrid quality v2). Env overrides for ops tuning without deploy. */
export function getRrfLegWeights(): { classic: number; vector: number } {
  const classic = Number.parseFloat(process.env.IMPRONTA_RRF_CLASSIC_WEIGHT ?? "1");
  const vector = Number.parseFloat(process.env.IMPRONTA_RRF_VECTOR_WEIGHT ?? "1.15");
  const c = Number.isFinite(classic) && classic > 0 ? classic : 1;
  const v = Number.isFinite(vector) && vector > 0 ? vector : 1.15;
  return { classic: c, vector: v };
}

/**
 * Reciprocal Rank Fusion over classic order and vector order.
 * Deterministic: ties broken by classic index, then talent id.
 */
export function mergeClassicItemsByRRF<T extends { id: string }>(
  classic: T[],
  vectorOrderedIds: string[],
  weights: { classic: number; vector: number } = getRrfLegWeights(),
): T[] {
  if (vectorOrderedIds.length === 0 || classic.length === 0) return classic;

  const classicRank = new Map<string, number>();
  classic.forEach((c, i) => {
    if (!classicRank.has(c.id)) classicRank.set(c.id, i + 1);
  });

  const vectorRank = new Map<string, number>();
  vectorOrderedIds.forEach((id, i) => {
    if (!vectorRank.has(id)) vectorRank.set(id, i + 1);
  });

  const byId = new Map(classic.map((c) => [c.id, c] as const));
  const idSet = new Set<string>();
  for (const c of classic) idSet.add(c.id);
  for (const id of vectorOrderedIds)
    if (byId.has(id)) idSet.add(id);

  const scored = [...idSet].map((id) => {
    const cr = classicRank.get(id);
    const vr = vectorRank.get(id);
    let score = 0;
    if (cr != null) score += (weights.classic * 1) / (RRF_K + cr);
    if (vr != null) score += (weights.vector * 1) / (RRF_K + vr);
    const classicIdx = cr ?? 99999;
    return { id, score, classicIdx };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.classicIdx !== b.classicIdx) return a.classicIdx - b.classicIdx;
    return a.id.localeCompare(b.id);
  });

  const out: T[] = [];
  for (const s of scored) {
    const row = byId.get(s.id);
    if (row) out.push(row);
  }
  return out;
}

export type HybridMergeStrategy = "classic_only" | "vector_reorder" | "rrf";

export function applyHybridMergeToCards(
  classic: DirectoryCardDTO[],
  vectorOrderedIds: string[],
  strategy: HybridMergeStrategy,
): DirectoryCardDTO[] {
  if (strategy === "classic_only") return classic;
  if (strategy === "rrf") {
    return mergeClassicItemsByRRF(classic, vectorOrderedIds);
  }
  return mergeClassicItemsByVectorOrder(classic, vectorOrderedIds);
}
