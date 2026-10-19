/**
 * blog-index-model.ts: the PURE half of the `/blog` index (TUL-1003 / TUL-1006).
 * Pagination, copy and the SEO rules for the list page, plus the "does this
 * site have a listable post" check the nav uses. No I/O, so every rule is
 * unit-tested with plain values. The posts themselves are filtered by
 * `isListablePost` in `posts-public-model.ts` (single source of the rule).
 */

import { BLOG_PATH, isListablePost, postCopyLocale, type ListablePostFields, type LocalizedUrl } from "@/lib/cms/posts-public-model";

export const BLOG_INDEX_PAGE_SIZE = 10;
const MAX_PAGE = 1000;

/** `?page=n` → a positive integer; anything else is page 1. */
export function parseBlogIndexPage(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || !/^[0-9]{1,4}$/.test(value)) return 1;
  const n = Number(value);
  return n >= 1 && n <= MAX_PAGE ? n : 1;
}

export type BlogIndexPage<T> = {
  items: T[];
  page: number;
  totalPages: number;
  total: number;
  hasPrev: boolean;
  hasNext: boolean;
  /** Page 2+ of a list that does not reach it (the route 404s). */
  outOfRange: boolean;
};

export function paginateBlogIndex<T>(items: readonly T[], page: number, size = BLOG_INDEX_PAGE_SIZE): BlogIndexPage<T> {
  const totalPages = Math.max(1, Math.ceil(items.length / size));
  const outOfRange = page > totalPages;
  const start = (page - 1) * size;
  return {
    items: outOfRange ? [] : items.slice(start, start + size),
    page,
    totalPages,
    total: items.length,
    hasPrev: page > 1,
    hasNext: page < totalPages,
    outOfRange,
  };
}

/** Locale-free path of the index: page 1 is the clean URL. */
export function blogIndexHref(page: number): string {
  return page > 1 ? `${BLOG_PATH}?page=${page}` : BLOG_PATH;
}

const COPY = {
  es: {
    title: "Blog",
    empty: "Todavía no hay entradas publicadas.",
    older: "Anteriores",
    newer: "Más recientes",
    pageOf: (n: number, total: number) => `Página ${n} de ${total}`,
    description: (site: string) => `Entradas y novedades de ${site}.`,
  },
  en: {
    title: "Blog",
    empty: "No posts have been published yet.",
    older: "Older",
    newer: "Newer",
    pageOf: (n: number, total: number) => `Page ${n} of ${total}`,
    description: (site: string) => `Posts and news from ${site}.`,
  },
} as const;

export function blogIndexCopy(locale: string) {
  return COPY[postCopyLocale(locale)];
}

export type BlogIndexSeo = {
  canonical: string;
  languages?: Record<string, string>;
  noindex: boolean;
};

/**
 * Canonical, hreflang and robots for one index page.
 *  - page 1 canonicalises to the clean `/blog`; page n is self-canonical.
 *  - hreflang only names locales that have a list at that page (an empty or
 *    shorter list in another language would be a soft 404 / noindex), and only
 *    when at least two locales qualify.
 *  - an empty list is noindex.
 */
export function buildBlogIndexSeo(input: {
  urlFor: LocalizedUrl;
  locale: string;
  page: number;
  siteLocales: readonly string[];
  counts: Readonly<Record<string, number>>;
}): BlogIndexSeo {
  const { urlFor, locale, page } = input;
  const suffix = page > 1 ? `?page=${page}` : "";
  const at = (l: string) => `${urlFor(BLOG_PATH, l)}${suffix}`;
  const reaches = (l: string) => Math.ceil((input.counts[l] ?? 0) / BLOG_INDEX_PAGE_SIZE) >= page && (input.counts[l] ?? 0) > 0;
  const qualifying = [...new Set([locale, ...input.siteLocales])].filter(reaches);
  const languages = qualifying.length > 1 ? Object.fromEntries(qualifying.map((l) => [l, at(l)])) : undefined;
  return {
    canonical: at(locale),
    ...(languages ? { languages } : {}),
    noindex: (input.counts[locale] ?? 0) === 0,
  };
}

/** True when at least one row is listable (the nav and the sitemap gate). */
export function hasListablePost(rows: readonly ListablePostFields[], now: Date): boolean {
  return rows.some((r) => isListablePost(r, now));
}
