/**
 * noir-portfolio — the editorial slot algorithm for the Noir profile.
 *
 * Pure functions, no React. Given the talent's gallery in its stored
 * sort_order, decide which images open the page ("first look"), which one
 * becomes the cinematic full-bleed band, and which fill the masonry. The
 * gallery order the agency set in the media manager IS the editorial order;
 * this module only assigns slots, it never re-ranks by taste.
 *
 *   n >= 5 : two tall portraits + a stacked pair (landscape over portrait)
 *   3..4   : three equal portraits
 *   2      : a two-up spread
 *   1      : one image beside the positioning quote
 *   0      : no strip (the hero carries the portrait)
 *
 * The first landscape image (w > h) also becomes the cinematic band further
 * down the page. Images with unknown dimensions count as portraits, which is
 * the common case for talent photography.
 */

export type NoirGalleryItem = {
  id: string;
  url: string;
  width: number | null;
  height: number | null;
};

export type NoirLookKind = "quad" | "trio" | "duo" | "solo" | "none";

export type NoirPortfolioPlan = {
  /** Composition of the opening strip. */
  lookKind: NoirLookKind;
  /** Items in the opening strip, in slot order. */
  look: NoirGalleryItem[];
  /** Landscape image for the full-bleed band, or null when none exists. */
  cinematic: NoirGalleryItem | null;
  /** Everything not used above, in stored order, for the masonry. */
  rest: NoirGalleryItem[];
  /**
   * Index of every item in the ORIGINAL gallery, keyed by id, so any tile can
   * open the shared lightbox at the right position.
   */
  indexById: Map<string, number>;
};

export function isLandscape(item: Pick<NoirGalleryItem, "width" | "height">): boolean {
  return Boolean(item.width && item.height && item.width > item.height);
}

/**
 * @param items    gallery in stored order
 * @param skip     number of leading items already shown elsewhere (the
 *                 no-banner hero strip takes the first three), so the opening
 *                 strip never repeats them
 */
export function planNoirPortfolio(
  items: NoirGalleryItem[],
  skip = 0,
): NoirPortfolioPlan {
  const indexById = new Map<string, number>();
  items.forEach((it, i) => indexById.set(it.id, i));

  const pool = items.slice(skip);
  const used = new Set<string>();
  const take = (it: NoirGalleryItem | undefined): NoirGalleryItem | null => {
    if (!it || used.has(it.id)) return null;
    used.add(it.id);
    return it;
  };

  const portraits = pool.filter((it) => !isLandscape(it));
  const landscapes = pool.filter(isLandscape);

  let lookKind: NoirLookKind = "none";
  const look: NoirGalleryItem[] = [];

  if (pool.length >= 5) {
    lookKind = "quad";
    const a = take(portraits[0]) ?? take(pool[0]);
    const b = take(portraits[1]) ?? take(pool.find((it) => !used.has(it.id)));
    const c = take(landscapes[0]) ?? take(pool.find((it) => !used.has(it.id)));
    const d = take(portraits.find((it) => !used.has(it.id))) ?? take(pool.find((it) => !used.has(it.id)));
    for (const it of [a, b, c, d]) if (it) look.push(it);
  } else if (pool.length >= 3) {
    lookKind = "trio";
    for (const it of pool.slice(0, 3)) {
      const t = take(it);
      if (t) look.push(t);
    }
  } else if (pool.length === 2) {
    lookKind = "duo";
    for (const it of pool) {
      const t = take(it);
      if (t) look.push(t);
    }
  } else if (pool.length === 1) {
    lookKind = "solo";
    const t = take(pool[0]);
    if (t) look.push(t);
  }

  // The cinematic band may reuse the landscape already in the strip: it is a
  // different crop at a different scale, and a second landscape is rare.
  const cinematic = landscapes[0] ?? null;

  const rest = pool.filter((it) => !used.has(it.id));

  return { lookKind, look, cinematic, rest, indexById };
}
