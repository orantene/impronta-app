/**
 * Pure helpers for picking public media URLs for talent-site hydration.
 *
 * Headshot must prefer a portrait (`card`) over gallery work shots — demos
 * already do this via `MediaUrls.card`; apply-time hydrate used to take
 * `media[0]` by sort_order and baked a lashes close-up into the hero.
 */

export type MediaVariantKind = "card" | "hero" | "public_watermarked" | "gallery" | string;

export type MediaPickRow = {
  url: string;
  variantKind: MediaVariantKind;
  sortOrder?: number | null;
};

const HEADSHOT_RANK: Readonly<Record<string, number>> = {
  card: 0,
  hero: 1,
  public_watermarked: 2,
  gallery: 3,
};

/** Stable order: preferred variant first, then sort_order, then original index. */
export function pickHeadshotUrl(rows: ReadonlyArray<MediaPickRow>): string | null {
  const scored = rows
    .map((r, i) => ({
      url: r.url?.trim() ?? "",
      rank: HEADSHOT_RANK[r.variantKind] ?? 9,
      sort: typeof r.sortOrder === "number" ? r.sortOrder : Number.MAX_SAFE_INTEGER,
      i,
    }))
    .filter((r) => r.url.length > 0);
  scored.sort((a, b) => a.rank - b.rank || a.sort - b.sort || a.i - b.i);
  return scored[0]?.url ?? null;
}

/** First hero-variant URL (talent at work), else null. */
export function pickHeroWorkUrl(rows: ReadonlyArray<MediaPickRow>): string | null {
  const hero = rows
    .filter((r) => r.variantKind === "hero" && r.url?.trim())
    .sort(
      (a, b) =>
        (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER),
    );
  return hero[0]?.url.trim() ?? null;
}

/**
 * Gallery URLs for work strip / inset — omit card portraits and the chosen
 * headshot so the hero never duplicates as tile 1.
 */
export function pickGalleryUrls(
  rows: ReadonlyArray<MediaPickRow>,
  headshotUrl: string | null,
  limit = 6,
): string[] {
  const head = headshotUrl?.trim() ?? "";
  const out: string[] = [];
  const seen = new Set<string>();
  const ordered = [...rows].sort(
    (a, b) =>
      (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER),
  );
  for (const r of ordered) {
    if (r.variantKind === "card") continue;
    const url = r.url?.trim() ?? "";
    if (!url || url === head || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
    if (out.length >= limit) break;
  }
  return out;
}

export type LiveMediaUrls = {
  headshotUrl: string;
  /** Detail / work photo for the hero inset. */
  insetUrl: string;
  /** About portrait — prefer hero-at-work, else headshot. */
  aboutUrl: string;
  gallery: string[];
};

export function resolveLiveMediaUrls(rows: ReadonlyArray<MediaPickRow>): LiveMediaUrls {
  const headshotUrl = pickHeadshotUrl(rows) ?? "";
  const gallery = pickGalleryUrls(rows, headshotUrl || null, 8);
  const heroWork = pickHeroWorkUrl(rows) ?? "";
  const insetUrl =
    gallery.find((u) => u !== headshotUrl && u !== heroWork) ??
    gallery[0] ??
    heroWork ??
    "";
  const aboutUrl = heroWork || headshotUrl;
  return { headshotUrl, insetUrl, aboutUrl, gallery };
}
