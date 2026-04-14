/**
 * Hard caps for hybrid search — see docs/search-performance-budget.md
 */
function envInt(name: string, fallback: number): number {
  const v = process.env[name]?.trim();
  if (!v) return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function getMaxVectorNeighbors(): number {
  return Math.min(200, Math.max(20, envInt("IMPRONTA_SEARCH_MAX_VECTOR_K", 100)));
}

export function getMaxClassicFetchHybrid(displayLimit: number): number {
  const cap = Math.min(
    96,
    Math.max(displayLimit, envInt("IMPRONTA_SEARCH_MAX_CLASSIC_FETCH", 72)),
  );
  return cap;
}

export const MAX_REFINE_SUGGESTIONS_RETURN = 12;
