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
 *  - A container left with no children is removed.
 *  - Every Contents entry that pointed at a removed anchor is removed.
 */
import { resolveCompCardDisplay } from "@/lib/site-admin/builder-node/comp-card-block";
import { filterShotsForPortfolio } from "@/lib/site-admin/builder-node/portfolio-selection";
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

  const keep = (n: BuilderNode): BuilderNode | null => {
    const p = propsOf(n);
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
    const kids = (n as AnyNode).children;
    if (Array.isArray(kids) && kids.length > 0) {
      const next = kids.map(keep).filter((k): k is BuilderNode => k !== null);
      if (next.length === 0) return null;
      return { ...n, children: next } as BuilderNode;
    }
    return n;
  };

  const pruned = tree.map(keep).filter((k): k is BuilderNode => k !== null);
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
