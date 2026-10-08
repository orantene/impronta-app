/**
 * Pure helpers for the paged talent media bundle (#224).
 *
 * `actionLoadTalentMediaBundle` used to read EVERY media row of a talent in one
 * unbounded query. The bundle now reads (a) the small singleton variants
 * (hero / card / reel / polaroids) in one bounded query and (b) the gallery in
 * pages. Nothing here touches Supabase, so it is unit-testable.
 */

/** First-page size for callers that only need a preview. */
export const TALENT_MEDIA_PAGE_SIZE = 60;
/** Hard ceiling for one page request. */
export const TALENT_MEDIA_MAX_PAGE_SIZE = 500;
/** Chunk size when a caller needs the WHOLE gallery (editors). */
export const TALENT_MEDIA_ALL_CHUNK = 500;
/** Safety stop for the "load everything" loop (never spin forever). */
export const TALENT_MEDIA_ALL_MAX_ROWS = 20_000;
/** Singleton variants are bounded by design (1 hero, 1 card, 1 reel, ~N polaroid slots). */
export const TALENT_MEDIA_SINGLETON_LIMIT = 200;

export const TALENT_MEDIA_SINGLETON_KINDS = ["hero", "card", "reel", "polaroid"] as const;

export type PageWindow = { offset: number; limit: number; from: number; to: number };

/** Clamp untrusted offset/limit and return the inclusive `.range(from, to)` window. */
export function pageWindow(offset?: number | null, limit?: number | null): PageWindow {
  const safeOffset = Number.isFinite(offset) && (offset as number) > 0 ? Math.floor(offset as number) : 0;
  const rawLimit = Number.isFinite(limit) && (limit as number) > 0 ? Math.floor(limit as number) : TALENT_MEDIA_PAGE_SIZE;
  const safeLimit = Math.min(rawLimit, TALENT_MEDIA_MAX_PAGE_SIZE);
  return { offset: safeOffset, limit: safeLimit, from: safeOffset, to: safeOffset + safeLimit - 1 };
}

/** True when rows exist beyond the page that was just read. */
export function computeHasMore(offset: number, returned: number, total: number): boolean {
  return offset + returned < total;
}

/** Offset of the next page, or null when the gallery is exhausted. */
export function nextOffset(offset: number, returned: number, total: number): number | null {
  return computeHasMore(offset, returned, total) && returned > 0 ? offset + returned : null;
}

/** Append a freshly loaded page to what is already shown, skipping ids already present. */
export function appendUniquePage<T extends { id: string }>(existing: T[], incoming: T[]): T[] {
  if (incoming.length === 0) return existing;
  const seen = new Set(existing.map((x) => x.id));
  return existing.concat(incoming.filter((x) => !seen.has(x.id)));
}
