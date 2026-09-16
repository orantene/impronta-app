/**
 * image-resolver.ts — build the `ImageResolver` a compose uses: OWNER media
 * first, lifestyle STOCK second, nothing third. Pure; the IO that gathers the
 * two lists lives in the composer.
 *
 * Owner media is matched by role hints when the media row carries one
 * (`metadata.stock_role` on stock, `variant_kind`/aspect on owner uploads),
 * else by aspect ratio: wide frames go to hero/wide, tall to portrait/team,
 * anything to gallery/detail. Each photo is handed out once per role pass so
 * a nine-slot Look shows nine different frames when nine exist.
 */

import type { ImageResolver, ImageRole, ImageSlotKey, ResolvedImage } from "./types";

export interface CandidateImage {
  src: string;
  width: number | null;
  height: number | null;
  alt: { es: string; en: string };
  /** A declared role beats any aspect guess. */
  role?: ImageRole | null;
  /** Owner uploads outrank stock regardless of fit. */
  owner: boolean;
}

function fitScore(c: CandidateImage, role: ImageRole): number {
  if (c.role === role) return 3;
  if (!c.width || !c.height) return 1;
  const ratio = c.width / c.height;
  switch (role) {
    case "hero":
    case "wide":
      return ratio >= 1.3 ? 2 : ratio >= 1 ? 1.5 : 0.5;
    case "portrait":
    case "team":
      return ratio <= 0.9 ? 2 : ratio <= 1.1 ? 1.5 : 0.5;
    case "gallery":
    case "detail":
      return 1.2;
  }
}

/**
 * Returns a resolver plus the list of picks, so the composer can report which
 * slots came from the owner, which from stock, and which stayed empty.
 */
export function buildImageResolver(candidates: ReadonlyArray<CandidateImage>): {
  resolve: ImageResolver;
  picks: Array<{ slot: ImageSlotKey; source: "owner" | "stock" | "none"; src: string | null }>;
} {
  const used = new Set<string>();
  const picks: Array<{ slot: ImageSlotKey; source: "owner" | "stock" | "none"; src: string | null }> = [];
  const resolve: ImageResolver = (slot, role) => {
    const ranked = [...candidates]
      // Unused owner > unused stock > a photo already placed (an owner's one
      // photo repeated in nine frames reads as broken, not as "theirs").
      .map((c) => ({ c, score: (c.owner ? 10 : 0) + fitScore(c, role) - (used.has(c.src) ? 12 : 0) }))
      .sort((a, b) => b.score - a.score);
    const best = ranked[0]?.c ?? null;
    if (!best) {
      picks.push({ slot, source: "none", src: null });
      return null;
    }
    used.add(best.src);
    picks.push({ slot, source: best.owner ? "owner" : "stock", src: best.src });
    const out: ResolvedImage = { src: best.src, alt: best.alt };
    return out;
  };
  return { resolve, picks };
}
