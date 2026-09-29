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
 *  - Chapters not keyed to an album take the talent's own albums first (in
 *    album order), and then carry that album's name as their title.
 *  - Surviving chapters are renumbered I, II, III in page order.
 *  - Every Contents entry (Contents block or a magazine masthead index) whose
 *    anchor is not on the pruned page is removed; chapter entries follow the
 *    chapter's final title and credit.
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

/** A talent media album (`media_albums_data`), in the talent's order. */
export type MyContentAlbum = { id: string; name: string };

/**
 * Chapter id to the media ids it should show. Chapters whose album matches
 * photos keep their album; the rest take the talent's other albums in order
 * (recorded in `titles` so the chapter wears the album name), then split the
 * remaining photos in order.
 */
export function distributeChapterShots(
  chapters: readonly BuilderNode[],
  shots: readonly TalentPortfolioShot[],
  albums: readonly MyContentAlbum[] = [],
  titles: Map<string, string> = new Map(),
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const used = new Set<string>();
  const usedAlbums = new Set<string>();
  let unkeyed: BuilderNode[] = [];
  for (const ch of chapters) {
    const p = propsOf(ch);
    const album = typeof p.albumId === "string" ? p.albumId.trim() : "";
    const own = album
      ? filterShotsForPortfolio(shots, { albumId: album, limit: chapterLimit(p) })
      : [];
    if (own.length > 0) {
      out.set(ch.id, own.map((s) => s.id));
      own.forEach((s) => used.add(s.id));
      usedAlbums.add(album);
    } else {
      unkeyed.push(ch);
    }
  }
  const freeAlbums = albums.filter((a) => a.id.trim() && !usedAlbums.has(a.id.trim()));
  const rest: BuilderNode[] = [];
  for (const ch of unkeyed) {
    let placed = false;
    while (!placed && freeAlbums.length > 0) {
      const album = freeAlbums.shift()!;
      const own = filterShotsForPortfolio(
        shots.filter((s) => !used.has(s.id)),
        { albumId: album.id.trim(), limit: chapterLimit(propsOf(ch)) },
      );
      if (own.length === 0) continue;
      out.set(ch.id, own.map((s) => s.id));
      own.forEach((s) => used.add(s.id));
      if (album.name.trim()) titles.set(ch.id, album.name.trim());
      placed = true;
    }
    if (!placed) rest.push(ch);
  }
  unkeyed = rest;
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
  albums: readonly MyContentAlbum[] = [],
): BuilderNode[] {
  const shots = ds.talentPortfolioShots ?? [];
  const chapters: BuilderNode[] = [];
  walk(tree, (n) => {
    if (isChapter(n)) chapters.push(n);
  });
  const albumTitles = new Map<string, string>();
  const chapterShots = distributeChapterShots(chapters, shots, albums, albumTitles);
  const offerings = ds.talentOfferings ?? [];
  const priced = hasPricedOffering(ds);

  const keep = (n: BuilderNode): BuilderNode | null => {
    const p = propsOf(n);
    if (n.kind === "portfolio") {
      if (isChapter(n)) {
        const ids = chapterShots.get(n.id) ?? [];
        if (ids.length === 0) return null;
        const albumTitle = albumTitles.get(n.id);
        return {
          ...n,
          props: {
            ...p,
            // Keep the Design's chapter creditLine (TOC + chapter head); only
            // the title tracks the bound album name.
            ...(albumTitle ? { title: albumTitle } : {}),
            albumId: "",
            selectionMode: "ids",
            selectedMediaIds: ids,
            autoIncludeNew: false,
          },
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

  const pruned = renumberChapters(
    tree.map(keep).filter((k): k is BuilderNode => k !== null),
  );
  const after = anchorsOf(pruned);

  // Chapter anchor -> its final title / credit (album names, renumbering).
  const chapterCopy = new Map<string, { title: string; credit: string }>();
  walk(pruned, (n) => {
    if (!isChapter(n)) return;
    const p = propsOf(n);
    const anchor = (n as AnyNode).anchorId ?? (typeof p.anchorId === "string" ? p.anchorId : "");
    if (!anchor) return;
    chapterCopy.set(anchor, {
      title: typeof p.title === "string" ? p.title : "",
      credit: typeof p.creditLine === "string" ? p.creditLine : "",
    });
  });

  type Row = { label?: unknown; anchor?: unknown; credit?: unknown };
  const fixRows = (rows: unknown): Row[] | null => {
    if (!Array.isArray(rows)) return null;
    return (rows as Row[])
      .filter((it) => {
        const a = typeof it.anchor === "string" ? it.anchor.replace(/^#/, "") : "";
        return a !== "" && after.has(a);
      })
      .map((it) => {
        const a = (it.anchor as string).replace(/^#/, "");
        const ch = chapterCopy.get(a);
        if (!ch || !ch.title) return it;
        // Album bind may rename the chapter; keep the Design's TOC credit
        // (short index line), not the longer chapter-head credit.
        const fromAlbum = albumTitles.size > 0 && [...albumTitles.values()].includes(ch.title);
        return fromAlbum ? { ...it, label: ch.title } : it;
      });
  };

  const fixContents = (n: BuilderNode): BuilderNode => {
    const kids = (n as AnyNode).children;
    const withKids = Array.isArray(kids)
      ? ({ ...n, children: kids.map(fixContents) } as BuilderNode)
      : n;
    const p = propsOf(n);
    if (n.kind === "contents") {
      return { ...withKids, props: { ...p, items: fixRows(p.items) ?? [] } } as BuilderNode;
    }
    if (n.kind === "masthead" && Array.isArray(p.contents)) {
      return { ...withKids, props: { ...p, contents: fixRows(p.contents) ?? [] } } as BuilderNode;
    }
    return withKids;
  };
  return pruned.map(fixContents);
}

/** Surviving chapters read I, II, III in page order. */
function renumberChapters(tree: BuilderNode[]): BuilderNode[] {
  let n = 0;
  const visit = (node: BuilderNode): BuilderNode => {
    const kids = (node as AnyNode).children;
    const withKids = Array.isArray(kids)
      ? ({ ...node, children: kids.map(visit) } as BuilderNode)
      : node;
    if (!isChapter(node)) return withKids;
    n += 1;
    return { ...withKids, props: { ...propsOf(node), chapterNumber: n } } as BuilderNode;
  };
  return tree.map(visit);
}

/**
 * Header / footer links to an in-page anchor the pruned page no longer has
 * (e.g. "Rates" when the rate card is hidden) are dropped too.
 */
export function pruneDeadAnchorLinks(
  shell: readonly BuilderNode[],
  designPage: readonly BuilderNode[],
  prunedPage: readonly BuilderNode[],
): BuilderNode[] {
  const live = anchorsOf([...shell, ...prunedPage]);
  const designed = anchorsOf(designPage);
  const visit = (node: BuilderNode): BuilderNode => {
    const kids = (node as AnyNode).children;
    const withKids = Array.isArray(kids)
      ? ({ ...node, children: kids.map(visit) } as BuilderNode)
      : node;
    const p = propsOf(node);
    if (!Array.isArray(p.links)) return withKids;
    const links = (p.links as Array<{ href?: unknown }>).filter((l) => {
      const href = typeof l?.href === "string" ? l.href.trim() : "";
      if (!href.startsWith("#") || href.length < 2) return true;
      const a = href.slice(1);
      return !designed.has(a) || live.has(a);
    });
    if (links.length === p.links.length) return withKids;
    return { ...withKids, props: { ...p, links } } as BuilderNode;
  };
  return shell.map(visit);
}
