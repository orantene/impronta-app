/**
 * DS-60 · a pro with no photo still publishes a site with a picture at the top.
 *
 * Maison's hero is one image node (`layerLabel: "Hero photo"`, `src` baked from
 * `{{headshotUrl}}`, which reads the talent's OWN `media_assets`). With no photo
 * it bakes to "" and the renderer skips the node, so the hero is empty. This is
 * the pure half of the fix: choose a platform-stock hero for the talent's type
 * and set it into that one node of the draft home tree. IO (reads, the draft
 * write) lives in `stock-hero.server.ts`.
 *
 * Never invents and never overwrites: an owner photo, or a hero node that
 * already has a `src`/`mediaId`, means no change. The pick reuses the compose
 * resolver (`buildImageResolver`: type pool, then family, then universal).
 */

import type { LifestyleStockPhoto } from "@/lib/media/platform-stock";
import { buildImageResolver, type CandidateImage, type ImagePickLevel } from "@/lib/site-admin/builder-core/site-templates/image-resolver";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { searchBusinessTypes, type BusinessFamilyId } from "@/lib/words/business-types";

export type StockHeroQuery = { businessType: string | null; family: BusinessFamilyId };

/** The stock pack for a talent type: the catalogue type its slug/label names, else the universal pack. */
export function stockQueryForTalentType(input: { slug: string | null; labelEn?: string | null }): StockHeroQuery {
  for (const raw of [input.slug?.replace(/[-_]+/g, " "), input.labelEn]) {
    const q = raw?.trim();
    if (!q) continue;
    const hit = searchBusinessTypes(q)[0];
    if (hit) return { businessType: hit.id, family: hit.family };
  }
  return { businessType: null, family: "custom" };
}

export type TalentTypeRow = {
  is_primary: boolean | null;
  display_order: number | null;
  taxonomy_terms: { kind: string | null; slug: string | null; name_i18n: Record<string, string | null> | null } | null;
};

/** The talent's primary `talent_type` (else the first by display order) as a stock query input. */
export function primaryTypeOf(rows: ReadonlyArray<TalentTypeRow> | null | undefined): { slug: string | null; labelEn: string | null } {
  const types = (rows ?? [])
    .filter((r) => r.taxonomy_terms?.kind === "talent_type")
    .slice()
    .sort((a, b) => Number(!!b.is_primary) - Number(!!a.is_primary) || (a.display_order ?? 0) - (b.display_order ?? 0));
  const term = types[0]?.taxonomy_terms;
  return { slug: term?.slug?.trim() || null, labelEn: term?.name_i18n?.en?.trim() || null };
}

/** Roles a hero frame may use; the small-frame roles (gallery, detail, portrait, team) never become the hero. */
const HERO_ROLES: ReadonlySet<string> = new Set(["hero", "wide"]);

export type StockHeroPick = { src: string; alt: { es: string; en: string }; level: ImagePickLevel; stockId: string };

type StockLike = Pick<LifestyleStockPhoto, "id" | "url" | "width" | "height" | "alt" | "role" | "businessType" | "family" | "originTenantId" | "timesPlaced" | "tags" | "direction">;

/** Level of a pool photo for this query: its own type, the family pack, or the universal pack. */
function levelFor(p: Pick<StockLike, "businessType" | "family">, q: StockHeroQuery): ImagePickLevel {
  if (p.businessType !== null && p.businessType === q.businessType) return "type";
  if (p.businessType === null && p.family === q.family && q.family !== "custom") return "family";
  return "universal";
}

/** Best platform-stock hero for the query, or null (empty pool, or nothing shaped like a hero). */
export function pickStockHero(photos: ReadonlyArray<StockLike>, query: StockHeroQuery): StockHeroPick | null {
  const candidates = photos
    // A tenant's own generated images were made for that business, never for a stranger's page.
    .filter((p) => p.originTenantId === null && HERO_ROLES.has(p.role) && p.url)
    .map<CandidateImage>((p) => ({
      src: p.url, width: p.width, height: p.height, alt: p.alt, role: p.role, owner: false,
      level: levelFor(p, query), stockId: p.id, direction: p.direction, tags: p.tags, timesPlaced: p.timesPlaced,
    }));
  if (candidates.length === 0) return null;
  const { resolve, picks } = buildImageResolver(candidates);
  const img = resolve("hero", "hero");
  const pick = picks[0];
  if (!img || !pick || pick.source !== "stock" || !pick.level || !pick.stockId) return null;
  return { src: img.src, alt: img.alt, level: pick.level, stockId: pick.stockId };
}

type Props = Record<string, unknown>;
type Kids = BuilderNode & { children?: BuilderNode[] };
const propsOf = (n: BuilderNode): Props => (n.props ?? {}) as Props;
const isEmptyStr = (v: unknown) => v === undefined || v === null || (typeof v === "string" && v.trim() === "");

/**
 * The hero image node: the one labelled "Hero photo" (Maison v2); else the
 * first image of the tree (Maison v1 puts the hero first and has no label).
 */
export function findHeroImageNode(tree: ReadonlyArray<BuilderNode>): BuilderNode | null {
  const found: { first: BuilderNode | null; labelled: BuilderNode | null } = { first: null, labelled: null };
  const walk = (nodes: ReadonlyArray<BuilderNode>) => {
    for (const n of nodes) {
      if (found.labelled) return;
      if (n.kind === "image") {
        if (propsOf(n).layerLabel === "Hero photo") found.labelled = n;
        else if (!found.first) found.first = n;
      }
      const kids = (n as Kids).children;
      if (Array.isArray(kids)) walk(kids);
    }
  };
  walk(tree);
  return found.labelled ?? found.first;
}

export type StockHeroSkip = "owner_photo" | "no_hero_slot" | "slot_filled" | "empty_pool";
export type StockHeroPlan =
  | { action: "skip"; reason: StockHeroSkip }
  | { action: "set"; nodeId: string; pick: StockHeroPick };

/** The whole decision. Owner photo wins, then a filled slot; only an empty hero slot gets stock. */
export function planStockHero(input: {
  hasOwnPhoto: boolean;
  homeTree: ReadonlyArray<BuilderNode>;
  photos: ReadonlyArray<StockLike>;
  query: StockHeroQuery;
}): StockHeroPlan {
  if (input.hasOwnPhoto) return { action: "skip", reason: "owner_photo" };
  const node = findHeroImageNode(input.homeTree);
  if (!node) return { action: "skip", reason: "no_hero_slot" };
  const p = propsOf(node);
  if (!isEmptyStr(p.src) || !isEmptyStr(p.mediaId)) return { action: "skip", reason: "slot_filled" };
  const pick = pickStockHero(input.photos, input.query);
  if (!pick) return { action: "skip", reason: "empty_pool" };
  return { action: "set", nodeId: node.id, pick };
}

/** The tree with the stock photo set into the hero node (other nodes keep their identity). */
export function withStockHero(tree: ReadonlyArray<BuilderNode>, nodeId: string, pick: StockHeroPick, locale: "en" | "es"): BuilderNode[] {
  const visit = (n: BuilderNode): BuilderNode => {
    const kids = (n as Kids).children;
    const nextKids = Array.isArray(kids) ? kids.map(visit) : undefined;
    const kidsChanged = !!nextKids && nextKids.some((k, i) => k !== kids![i]);
    if (n.id === nodeId && n.kind === "image") {
      // `stockSrc` marks the src as a placeholder, so her own photo replaces it later (live-media.ts).
      return { ...n, props: { ...propsOf(n), src: pick.src, stockSrc: pick.src, alt: pick.alt[locale] || pick.alt.en } } as BuilderNode;
    }
    return kidsChanged ? ({ ...n, children: nextKids } as BuilderNode) : n;
  };
  return tree.map(visit);
}
