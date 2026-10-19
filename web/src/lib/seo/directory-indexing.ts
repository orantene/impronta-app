import type { Metadata } from "next";

import { parsePageParam } from "@/lib/directory/pagination";

type Sp = Record<string, string | string[] | undefined>;

/** Page number and whether any filter/sort param narrows the listing (blank values do not count). */
export function directoryIndexing(sp: Sp): { page: number; filtered: boolean } {
  const rawPage = sp.page;
  const page = parsePageParam(Array.isArray(rawPage) ? rawPage[0] : rawPage);
  const filtered = Object.entries(sp).some(([key, value]) => {
    if (key === "page") return false;
    const vals = Array.isArray(value) ? value : [value];
    return vals.some((v) => (v ?? "").trim() !== "");
  });
  return { page, filtered };
}

/** Append ?page=n; a relative URL resolves against the metadata base, or is kept as-is when there is none. */
function withPage(url: string, page: number, base: URL | null): string {
  try {
    const u = new URL(url, base ?? undefined);
    u.searchParams.set("page", String(page));
    return u.toString();
  } catch {
    // Relative with no base: append by hand rather than throw.
    const [path, query = ""] = url.split("?");
    const sp = new URLSearchParams(query);
    sp.set("page", String(page));
    return `${path}?${sp.toString()}`;
  }
}

/**
 * /directory?page=n is self-canonical (and hreflang follows the same page); any filtered view is
 * noindex,follow with the clean canonical so crawl budget is not spent on facet permutations.
 */
export function applyDirectoryIndexing(meta: Metadata, sp: Sp): Metadata {
  const { page, filtered } = directoryIndexing(sp);
  if (filtered) return { ...meta, robots: { index: false, follow: true } };
  if (page <= 1 || !meta.alternates?.canonical) return meta;
  const base = meta.metadataBase instanceof URL ? meta.metadataBase : null;
  const canonical = meta.alternates.canonical;
  const languages = meta.alternates.languages;
  return {
    ...meta,
    alternates: {
      ...meta.alternates,
      canonical: typeof canonical === "string" ? withPage(canonical.toString(), page, base) : canonical,
      ...(languages
        ? {
            languages: Object.fromEntries(
              Object.entries(languages).map(([k, v]) => [k, typeof v === "string" ? withPage(v, page, base) : v]),
            ),
          }
        : {}),
    },
  };
}
