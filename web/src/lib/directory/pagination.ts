import { DIRECTORY_PAGE_SIZE_DEFAULT } from "./types";

/**
 * Addressable pages for the directory grid.
 *
 * ─── WHAT THIS IS AND IS NOT FOR ────────────────────────────────────────────
 *
 * This is a UX change, not an SEO one, and the distinction is worth stating
 * because it was mistaken for an SEO fix three times.
 *
 * `/global-directory` carries `<link rel="canonical" href=".../directory">`, so
 * Google consolidates it away and nothing rendered here affects indexing. The
 * crawl problem — 77 public profiles advertised nowhere — was real and was
 * fixed in the sitemap (#1814), not here.
 *
 * What this fixes is that the grid was only ever reachable as "page 1 plus
 * however many times you pressed Show more". A visitor three pages in could not
 * refresh, could not share what they were looking at, and lost their place on
 * the back button. `?page=N` makes each slice addressable.
 *
 * ─── WHY A PURE MODULE ──────────────────────────────────────────────────────
 *
 * The off-by-one lives here rather than in JSX so the last-page edge can be
 * tested without a browser: the final page is usually SHORT, and the common bug
 * is computing page count with a division that drops the remainder, which hides
 * the last few profiles behind a page nobody can reach.
 */

export type DirectoryPageWindow = {
  /** 1-based, clamped into range. */
  page: number;
  pageSize: number;
  /** Rows to skip for this page. */
  offset: number;
  totalPages: number;
  /** 1-based page numbers, or null for a gap in a long list. */
  pages: Array<number | null>;
  prev: number | null;
  next: number | null;
  /** Index of the first/last profile on this page, 1-based, for "x-y of z". */
  firstItem: number;
  lastItem: number;
};

/** How many numbered links to show before collapsing the middle into a gap. */
const MAX_NUMBERED = 7;

/**
 * Parse a `?page=` value. Anything that is not a positive integer is page 1 —
 * "abc", "0", "-3", "2.5" and an absent param all mean the same thing to a
 * visitor, and none of them should 404 a page that exists.
 */
export function parsePageParam(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return 1;
  if (!/^\d+$/.test(value.trim())) return 1;
  const n = Number.parseInt(value, 10);
  return Number.isSafeInteger(n) && n >= 1 ? n : 1;
}

export function buildDirectoryPageWindow(
  total: number,
  page: number,
  pageSize: number = DIRECTORY_PAGE_SIZE_DEFAULT,
): DirectoryPageWindow {
  const size = pageSize > 0 ? pageSize : DIRECTORY_PAGE_SIZE_DEFAULT;
  const safeTotal = Number.isFinite(total) && total > 0 ? Math.floor(total) : 0;

  // Ceiling division. A floor here is the classic version of this bug: 53 rows
  // at 24 per page is 3 pages, and `Math.floor(53/24)` gives 2 — the last 5
  // profiles become unreachable while the header still promises 53.
  const totalPages = safeTotal === 0 ? 1 : Math.ceil(safeTotal / size);
  const current = Math.min(Math.max(Math.floor(page) || 1, 1), totalPages);
  const offset = (current - 1) * size;

  return {
    page: current,
    pageSize: size,
    offset,
    totalPages,
    pages: numberedPages(current, totalPages),
    prev: current > 1 ? current - 1 : null,
    next: current < totalPages ? current + 1 : null,
    firstItem: safeTotal === 0 ? 0 : offset + 1,
    // The last page is SHORT, so this is not `offset + size`. Clamping to the
    // total is what makes "49-53 of 53" read correctly instead of "49-72 of 53".
    lastItem: Math.min(offset + size, safeTotal),
  };
}

/** First, last, and a window around the current page; `null` marks a gap. */
function numberedPages(current: number, totalPages: number): Array<number | null> {
  if (totalPages <= MAX_NUMBERED) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const out: Array<number | null> = [1];
  const from = Math.max(2, current - 1);
  const to = Math.min(totalPages - 1, current + 1);
  if (from > 2) out.push(null);
  for (let p = from; p <= to; p += 1) out.push(p);
  if (to < totalPages - 1) out.push(null);
  out.push(totalPages);
  return out;
}

/**
 * Href for a page, preserving every other filter.
 *
 * Page 1 deliberately omits `?page=1` so the canonical spelling of the first
 * page stays a single URL rather than two that render identically.
 */
export function directoryPageHref(
  basePath: string,
  params: URLSearchParams,
  page: number,
): string {
  const next = new URLSearchParams(params);
  if (page <= 1) next.delete("page");
  else next.set("page", String(page));
  const qs = next.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}
