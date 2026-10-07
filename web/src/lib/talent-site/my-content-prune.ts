/**
 * Theme gallery "My content" rule (Theme Gallery PDFs): "Your profile,
 * services and photos in this design. Sections without content are hidden."
 *
 * Pure projection of a hydrated Design tree against the live data sources the
 * preview binds. Demo mode never calls this.
 *
 *  - Portfolio chapters keyed to albums the talent does not have (or keyed to
 *    no album at all) share the talent's photos in order, so each chapter
 *    shows different work instead of an empty "No photos" chapter or the same
 *    six photos three times. A chapter left with no photos is removed.
 *  - Any other portfolio with no photos, a comp card with no rows, a services
 *    catalog with no offerings, and a rate card with no priced offering are
 *    removed.
 *  - A FAQ-bound accordion with no published questions, a visit block with no
 *    facts and a reviews block with no reviews are removed (F31).
 *  - A container left with no children is removed, and so is one that lost a
 *    data block and now holds only its labels (eyebrow + heading), so an
 *    empty "Questions / What I get asked" band never renders.
 *  - Every Contents entry that pointed at a removed anchor is removed.
 *
 * `pruneEmptyBoundSections` is the live-site subset (FAQ, visit, reviews and
 * the orphaned labels): no photo redistribution, nothing the talent chose.
 */
import { resolveCompCardDisplay } from "@/lib/site-admin/builder-node/comp-card-block";
import { filterShotsForPortfolio } from "@/lib/site-admin/builder-node/portfolio-selection";
import { filterOfferingsForCatalog } from "@/lib/site-admin/builder-node/services-catalog-selection";
import { TALENT_ASK_HREF } from "@/lib/talent-site/contact-channels";
import type { TalentPortfolioShot } from "@/lib/site-admin/builder-node/portfolio-types";
import type { BuilderNodeRenderDataSources } from "@/lib/site-admin/builder-node/render";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

type AnyNode = BuilderNode & { anchorId?: string; children?: BuilderNode[] };
type Props = Record<string, unknown>;

const propsOf = (n: BuilderNode): Props => (n.props ?? {}) as Props;

function walk(nodes: readonly BuilderNode[], fn: (n: BuilderNode) => void): void {
  for (const n of nodes) {
    fn(n);
    const kids = (n as AnyNode).children;
    if (Array.isArray(kids)) walk(kids, fn);
  }
}

function anchorsOf(nodes: readonly BuilderNode[]): Set<string> {
  const out = new Set<string>();
  walk(nodes, (n) => {
    const base = (n as AnyNode).anchorId;
    const prop = propsOf(n).anchorId;
    if (typeof base === "string" && base) out.add(base);
    if (typeof prop === "string" && prop) out.add(prop);
  });
  return out;
}

const isChapter = (n: BuilderNode) =>
  n.kind === "portfolio" && propsOf(n).layout === "chapter";

function chapterLimit(p: Props): number {
  const raw = typeof p.limit === "number" ? p.limit : 6;
  return Math.min(Math.max(raw, 1), 24);
}

/**
 * Chapter id to the media ids it should show. Chapters whose album matches
 * photos keep their album; the rest split the remaining photos in order.
 */
export function distributeChapterShots(
  chapters: readonly BuilderNode[],
  shots: readonly TalentPortfolioShot[],
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const used = new Set<string>();
  const unkeyed: BuilderNode[] = [];
  for (const ch of chapters) {
    const p = propsOf(ch);
    const album = typeof p.albumId === "string" ? p.albumId.trim() : "";
    const own = album
      ? filterShotsForPortfolio(shots, { albumId: album, limit: chapterLimit(p) })
      : [];
    if (own.length > 0) {
      out.set(ch.id, own.map((s) => s.id));
      own.forEach((s) => used.add(s.id));
    } else {
      unkeyed.push(ch);
    }
  }
  if (unkeyed.length === 0) return out;
  const pool = shots.filter((s) => !used.has(s.id));
  const per = Math.ceil(pool.length / unkeyed.length);
  unkeyed.forEach((ch, i) => {
    const take = Math.min(per, chapterLimit(propsOf(ch)));
    out.set(
      ch.id,
      pool.slice(i * per, i * per + take).map((s) => s.id),
    );
  });
  return out;
}

/** Nodes that only label a section; a section left with only these is empty. */
const LABEL_KINDS = new Set(["heading", "paragraph", "divider", "spacer"]);

/**
 * TUL-118 (DS-64): the FAQ band's "Ask a question" button only frames the
 * accordion (it opens the ask sheet), so it counts as a label. Any other
 * button, link or media is real content and keeps the band.
 */
function isFramingNode(n: BuilderNode): boolean {
  if (LABEL_KINDS.has(n.kind)) return true;
  return n.kind === "button" && propsOf(n).href === TALENT_ASK_HREF;
}

/** Data-bound blocks with nothing to show on the live site (F31). */
function isEmptyBoundBlock(n: BuilderNode, ds: BuilderNodeRenderDataSources): boolean {
  const p = propsOf(n);
  if (n.kind === "accordion" && p.bindSource === "talent_faq_items") {
    const authored = (n as AnyNode).children ?? [];
    return (ds.talentFaqItems ?? []).length === 0 && authored.length === 0;
  }
  if (n.kind === "visit") {
    // The location layout is driven by the location settings, not the facts.
    if (p.layout === "location") return !ds.talentLocation;
    return (ds.talentVisitFacts ?? []).length === 0;
  }
  if (n.kind === "reviews") return (ds.talentReviews ?? []).length === 0;
  // TUL-118 (DS-64): only when the source was actually loaded (an array), so a
  // render path that never fetched it keeps the block.
  if (n.kind === "services_catalog") {
    if (!Array.isArray(ds.talentOfferings)) return false;
    // A band marked for the live booking surface renders its own list.
    if (ds.liveBooking && (ds.liveBooking.services.length > 0 || ds.liveBooking.offerings.length > 0)) return false;
    return catalogVisibleCount(p, ds) === 0;
  }
  if (n.kind === "portfolio") {
    if (!Array.isArray(ds.talentPortfolioShots)) return false;
    return (
      filterShotsForPortfolio(ds.talentPortfolioShots, {
        selectionMode: p.selectionMode as "all" | "ids" | undefined,
        selectedMediaIds: p.selectedMediaIds as string[] | undefined,
        autoIncludeNew: p.autoIncludeNew as boolean | undefined,
        albumId: p.albumId as string | undefined,
      }).length === 0
    );
  }
  return false;
}

/** Offerings the catalog block would list, same filter the renderer uses. */
function catalogVisibleCount(p: Props, ds: BuilderNodeRenderDataSources): number {
  const sort = p.sort as Parameters<typeof filterOfferingsForCatalog>[1]["sort"];
  return filterOfferingsForCatalog(ds.talentOfferings ?? [], {
    selectionMode: p.selectionMode as "all" | "ids" | "categories" | undefined,
    selectedCategoryNames: p.selectedCategoryNames as string[] | undefined,
    selectedOfferingIds: p.selectedOfferingIds as string[] | undefined,
    autoIncludeNew: p.autoIncludeNew as boolean | undefined,
    featuredOfferingIds: p.featuredOfferingIds as string[] | undefined,
    sort,
    manualOrderIds: (sort === "manual"
      ? (p.manualOrderIds ?? p.selectedOfferingIds)
      : p.manualOrderIds) as string[] | undefined,
  }).length;
}

/**
 * Walk `tree` with `leaf` deciding each data block; containers drop when
 * empty, or when they lost a child and only labels remain.
 */
function pruneWith(
  tree: readonly BuilderNode[],
  leaf: (n: BuilderNode) => BuilderNode | null | undefined,
): BuilderNode[] {
  const keep = (n: BuilderNode): BuilderNode | null => {
    const decided = leaf(n);
    if (decided !== undefined) return decided;
    const kids = (n as AnyNode).children;
    if (Array.isArray(kids) && kids.length > 0) {
      const next = kids.map(keep).filter((k): k is BuilderNode => k !== null);
      if (next.length === 0) return null;
      if (next.length < kids.length && next.every(isFramingNode)) return null;
      return next.length === kids.length && next.every((k, i) => k === kids[i])
        ? n
        : ({ ...n, children: next } as BuilderNode);
    }
    return n;
  };
  return tree.map(keep).filter((k): k is BuilderNode => k !== null);
}

/** Live-site subset: hide empty FAQ / visit / reviews sections. */
export function pruneEmptyBoundSections(
  tree: readonly BuilderNode[],
  ds: BuilderNodeRenderDataSources,
): BuilderNode[] {
  const pruned = pruneWith(tree, (n) => (isEmptyBoundBlock(n, ds) ? null : undefined));
  return fixContentsAfterPrune(tree, pruned);
}

function hasPricedOffering(ds: BuilderNodeRenderDataSources): boolean {
  return (ds.talentOfferings ?? []).some(
    (o) =>
      typeof o.amountCents === "number" &&
      o.amountCents > 0 &&
      o.priceDisplay !== "quote" &&
      o.priceType !== "custom",
  );
}

export function pruneEmptyMyContentBlocks(
  tree: readonly BuilderNode[],
  ds: BuilderNodeRenderDataSources,
  locale = "en",
): BuilderNode[] {
  const shots = ds.talentPortfolioShots ?? [];
  const chapters: BuilderNode[] = [];
  walk(tree, (n) => {
    if (isChapter(n)) chapters.push(n);
  });
  const chapterShots = distributeChapterShots(chapters, shots);
  const offerings = ds.talentOfferings ?? [];
  const priced = hasPricedOffering(ds);

  const leaf = (n: BuilderNode): BuilderNode | null | undefined => {
    const p = propsOf(n);
    if (isEmptyBoundBlock(n, ds)) return null;
    if (n.kind === "portfolio") {
      if (isChapter(n)) {
        const ids = chapterShots.get(n.id) ?? [];
        if (ids.length === 0) return null;
        return {
          ...n,
          props: { ...p, albumId: "", selectionMode: "ids", selectedMediaIds: ids, autoIncludeNew: false },
        } as BuilderNode;
      }
      const visible = filterShotsForPortfolio(shots, {
        selectionMode: p.selectionMode as "all" | "ids" | undefined,
        selectedMediaIds: p.selectedMediaIds as string[] | undefined,
        autoIncludeNew: p.autoIncludeNew as boolean | undefined,
        albumId: p.albumId as string | undefined,
        limit: typeof p.limit === "number" ? p.limit : undefined,
      });
      return visible.length > 0 ? n : null;
    }
    if (n.kind === "comp_card") {
      const { empty } = resolveCompCardDisplay({
        node: n as Parameters<typeof resolveCompCardDisplay>[0]["node"],
        rows: ds.talentCompCard?.rows ?? [],
        locale,
      });
      return empty ? null : n;
    }
    if (n.kind === "services_catalog") {
      if (offerings.length === 0) return null;
      if (p.layout === "rate_card" && !priced) return null;
      return n;
    }
    return undefined;
  };

  return fixContentsAfterPrune(tree, pruneWith(tree, leaf));
}

/** Drop every Contents entry that pointed at an anchor the prune removed. */
function fixContentsAfterPrune(tree: readonly BuilderNode[], pruned: BuilderNode[]): BuilderNode[] {
  const before = anchorsOf(tree);
  const after = anchorsOf(pruned);
  const gone = new Set([...before].filter((a) => !after.has(a)));
  if (gone.size === 0) return pruned;

  const fixContents = (n: BuilderNode): BuilderNode => {
    const kids = (n as AnyNode).children;
    const withKids = Array.isArray(kids)
      ? ({ ...n, children: kids.map(fixContents) } as BuilderNode)
      : n;
    if (n.kind !== "contents") return withKids;
    const p = propsOf(n);
    const items = Array.isArray(p.items) ? (p.items as Array<{ anchor?: unknown }>) : [];
    const kept = items.filter((it) => {
      const a = typeof it.anchor === "string" ? it.anchor.replace(/^#/, "") : "";
      return !gone.has(a);
    });
    return { ...withKids, props: { ...p, items: kept } } as BuilderNode;
  };
  return pruned.map(fixContents);
}
