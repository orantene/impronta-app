/**
 * TUL-848 · a catalog with a single service must not sit in one column of a
 * 2/3-column grid (half-width card beside a large empty cell). Fewer items
 * than columns means fewer columns, never below one. Pure.
 */
export function effectiveCatalogColumns(columns: number, visibleCount: number): number {
  const wanted = Number.isFinite(columns) && columns >= 1 ? Math.floor(columns) : 1;
  if (visibleCount < 1) return wanted;
  return Math.max(1, Math.min(wanted, visibleCount));
}
