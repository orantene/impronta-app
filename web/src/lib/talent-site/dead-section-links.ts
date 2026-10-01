/**
 * A footer (or any shell) link to a page section must never be dead.
 *
 * The Location section replaced the visit band, and either can be absent on a
 * given page (the talent removed it, it is empty and was pruned, or the page is
 * a policy page that has neither). So a link to `#location` / `#visit` is decided
 * at RENDER time against the sections the page actually renders: kept when its
 * target exists, retargeted to the sibling section when only that one exists,
 * and dropped when neither does. Pure.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

type AnyNode = BuilderNode & { children?: BuilderNode[] };

/** Section anchors that stand in for each other (Location replaced the visit band). */
const SIBLINGS: Readonly<Record<string, string>> = { location: "visit", visit: "location" };

function anchorsOf(tree: ReadonlyArray<BuilderNode>, out = new Set<string>()): Set<string> {
  for (const n of tree) {
    const props = (n.props ?? {}) as { anchorId?: unknown; slotKey?: unknown };
    for (const v of [props.anchorId, (n as { anchorId?: unknown }).anchorId, props.slotKey]) {
      if (typeof v === "string" && v) out.add(v);
    }
    const kids = (n as AnyNode).children;
    if (Array.isArray(kids)) anchorsOf(kids, out);
  }
  return out;
}

/** `#location` or `#visit` links in `shell`, resolved against what `page` renders. */
export function pruneDeadSectionLinks(
  shell: ReadonlyArray<BuilderNode>,
  page: ReadonlyArray<BuilderNode>,
): BuilderNode[] {
  const anchors = anchorsOf(page);
  const fix = (n: BuilderNode): BuilderNode | null => {
    const href = (n.props as { href?: unknown } | undefined)?.href;
    if (typeof href === "string" && href.startsWith("#")) {
      const id = href.slice(1);
      const sibling = SIBLINGS[id];
      if (sibling && !anchors.has(id)) {
        if (!anchors.has(sibling)) return null;
        return { ...n, props: { ...n.props, href: `#${sibling}` } } as BuilderNode;
      }
    }
    const kids = (n as AnyNode).children;
    if (Array.isArray(kids) && kids.length > 0) {
      const next = kids.map(fix).filter((k): k is BuilderNode => k !== null);
      return next.length === kids.length && next.every((k, i) => k === kids[i]) ? n : ({ ...n, children: next } as BuilderNode);
    }
    return n;
  };
  return shell.map(fix).filter((k): k is BuilderNode => k !== null);
}
