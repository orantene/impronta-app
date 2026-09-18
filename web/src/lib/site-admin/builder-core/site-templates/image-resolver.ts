/**
 * image-resolver.ts — build the `ImageResolver` a compose uses: OWNER media
 * first, the tenant's own GENERATED images second, lifestyle STOCK third
 * (type pool, tag matches first, then family, then universal), nothing last.
 * Pure; the IO that gathers the lists lives in the composer, and the picks it
 * returns are what the composer STORES in `tenant_asset_assignments` (03 §5).
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
  /** Which pack a stock photo came from; "owner" for the tenant's own media; "tenant" for images generated for this business. */
  level?: ImagePickLevel;
  /** `platform_stock_images.id` for pool/tenant assets (stored on the assignment). */
  stockId?: string | null;
  direction?: string | null;
  /** Stated facts the asset was generated from; shared facts with the brief rank it above plain-type assets. */
  tags?: Record<string, string>;
  timesPlaced?: number;
}

export type ImagePickLevel = "owner" | "tenant" | "type" | "family" | "universal";

/** The `source` vocabulary of `tenant_asset_assignments`. */
export type AssignmentSource = "owner" | "tenant_generated" | "type_pool" | "family_pool" | "universal";

export function assignmentSourceForLevel(level: ImagePickLevel): AssignmentSource {
  switch (level) {
    case "owner":
      return "owner";
    case "tenant":
      return "tenant_generated";
    case "type":
      return "type_pool";
    case "family":
      return "family_pool";
    case "universal":
      return "universal";
  }
}

export interface ImagePick {
  page: string;
  slot: ImageSlotKey;
  source: "owner" | "stock" | "none";
  level: ImagePickLevel | null;
  src: string | null;
  stockId: string | null;
  direction: string | null;
}

const LEVEL_BONUS: Readonly<Record<ImagePickLevel, number>> = { owner: 10, tenant: 8, type: 4, family: 2, universal: 0 };

/** How many of the brief's facts an asset shares (tag-first selection, 03 §5). */
function sharedFacts(tags: Record<string, string> | undefined, briefTags: Record<string, string> | undefined): number {
  if (!tags || !briefTags) return 0;
  let n = 0;
  for (const [k, v] of Object.entries(briefTags)) if (tags[k] && tags[k].toLowerCase() === v.toLowerCase()) n += 1;
  return n;
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
 * slots came from the owner, which from stock, and which stayed empty, and
 * store each pick. `briefTags` are the brief's stated facts (03 §3c); an asset
 * sharing more of them outranks a plain-type asset. Among equals the least
 * placed asset wins, so tenants of one type spread across the pool.
 */
export function buildImageResolver(
  candidates: ReadonlyArray<CandidateImage>,
  options: { briefTags?: Record<string, string> } = {},
): { resolve: ImageResolver; picks: ImagePick[] } {
  const used = new Set<string>();
  const picks: ImagePick[] = [];
  // One frame per page+slot: a Look that names "wide" twice on the home page
  // (sticky story + a picture) gets the SAME photo, so the stored assignment
  // and the per-site swap cover both nodes (p13: the second call drew a
  // different universal photo that no job could ever replace).
  const memo = new Map<string, ResolvedImage | null>();
  const resolve: ImageResolver = (slot, role, page = "home") => {
    const memoKey = `${page}|${slot}`;
    if (memo.has(memoKey)) return memo.get(memoKey) ?? null;
    const ranked = [...candidates]
      // Unused owner > unused tenant > unused pool (tag matches, then pack level)
      // > a photo already placed (one photo in nine frames reads as broken).
      .map((c) => {
        const level: ImagePickLevel = c.owner ? "owner" : (c.level ?? "universal");
        const score =
          LEVEL_BONUS[level] +
          fitScore(c, role) +
          Math.min(3, sharedFacts(c.tags, options.briefTags)) * 1.5 -
          (used.has(c.src) ? 12 : 0) -
          Math.min(1, (c.timesPlaced ?? 0) / 50);
        return { c, level, score };
      })
      .sort((a, b) => b.score - a.score);
    const best = ranked[0] ?? null;
    if (!best) {
      picks.push({ page, slot, source: "none", level: null, src: null, stockId: null, direction: null });
      memo.set(memoKey, null);
      return null;
    }
    used.add(best.c.src);
    picks.push({ page, slot, source: best.c.owner ? "owner" : "stock", level: best.level, src: best.c.src, stockId: best.c.stockId ?? null, direction: best.c.direction ?? null });
    const out: ResolvedImage = { src: best.c.src, alt: best.c.alt };
    memo.set(memoKey, out);
    return out;
  };
  return { resolve, picks };
}
