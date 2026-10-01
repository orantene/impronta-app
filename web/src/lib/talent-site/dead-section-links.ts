/**
 * A shell link to a page section must never be dead.
 *
 * Sections come and go per page: the Location band replaced the visit band, a
 * talent with no reviews renders no Reviews band, a policy page renders none of
 * them. So every in-page link in the header and footer (`#reviews`, `#location`,
 * `#services` ...) is decided at RENDER time against the sections the page
 * actually renders, plus the shell's own anchors (the footer):
 *
 *  - kept when its target exists;
 *  - Location and Visit stand in for each other (retargeted to the one present);
 *  - dropped when its target is not on the page.
 *
 * `#talent-ask` is exempt: it is a real target on every talent page (the chat
 * entry, see TalentSiteContactBridge). Covers node `href`s and a header
 * landmark's `navItems` and region items. Pure.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

type AnyNode = BuilderNode & { children?: BuilderNode[] };

/** Section anchors that stand in for each other (Location replaced the visit band). */
const SIBLINGS: Readonly<Record<string, string>> = { location: "visit", visit: "location" };
/** Targets that exist on every talent page without being a page section. */
const ALWAYS_PRESENT = new Set(["talent-ask", "main-content", "top"]);

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

/** The href to keep for `href`, or null when it would be a dead anchor. */
function resolveHref(href: string, anchors: ReadonlySet<string>): string | null {
  if (!href.startsWith("#") || href.length < 2) return href;
  const id = href.slice(1);
  if (ALWAYS_PRESENT.has(id) || anchors.has(id)) return href;
  const sibling = SIBLINGS[id];
  if (sibling && anchors.has(sibling)) return `#${sibling}`;
  return null;
}

type LinkItem = { href?: unknown };

function fixItems<T extends LinkItem>(items: readonly T[], anchors: ReadonlySet<string>): T[] {
  const out: T[] = [];
  for (const item of items) {
    if (typeof item?.href !== "string") {
      out.push(item);
      continue;
    }
    const next = resolveHref(item.href, anchors);
    if (next === null) continue;
    out.push(next === item.href ? item : { ...item, href: next });
  }
  return out;
}

/** A header landmark's section props: nav links and region items with an in-page href. */
function fixSectionProps(sp: Record<string, unknown>, anchors: ReadonlySet<string>): Record<string, unknown> {
  let next = sp;
  if (Array.isArray(sp.navItems)) {
    const orig = sp.navItems as LinkItem[];
    const items = fixItems(orig, anchors);
    if (items.length !== orig.length || items.some((it, i) => it !== orig[i])) next = { ...next, navItems: items };
  }
  const regions = sp.regions;
  if (regions && typeof regions === "object") {
    let changed = false;
    const fixed: Record<string, unknown> = {};
    for (const [name, items] of Object.entries(regions as Record<string, unknown>)) {
      if (Array.isArray(items)) {
        const f = fixItems(items as LinkItem[], anchors);
        if (f.length !== items.length || f.some((it, i) => it !== items[i])) changed = true;
        fixed[name] = f;
      } else {
        fixed[name] = items;
      }
    }
    if (changed) next = { ...next, regions: fixed };
  }
  return next;
}

/**
 * Shell links resolved against what `page` renders (plus the shell's own
 * anchors). Pass the header and the footer trees separately, or together.
 */
export function pruneDeadSectionLinks(
  shell: ReadonlyArray<BuilderNode>,
  page: ReadonlyArray<BuilderNode>,
  extraAnchorTrees: ReadonlyArray<ReadonlyArray<BuilderNode>> = [],
): BuilderNode[] {
  const anchors = anchorsOf(page);
  anchorsOf(shell, anchors);
  for (const t of extraAnchorTrees) anchorsOf(t, anchors);

  const fix = (n: BuilderNode): BuilderNode | null => {
    let node = n;
    const props = (node.props ?? {}) as Record<string, unknown>;
    if (typeof props.href === "string") {
      const next = resolveHref(props.href, anchors);
      if (next === null) return null;
      if (next !== props.href) node = { ...node, props: { ...props, href: next } } as BuilderNode;
    }
    const sp = props.sectionProps;
    if (sp && typeof sp === "object") {
      const fixedSp = fixSectionProps(sp as Record<string, unknown>, anchors);
      if (fixedSp !== sp) node = { ...node, props: { ...(node.props as object), sectionProps: fixedSp } } as BuilderNode;
    }
    const kids = (node as AnyNode).children;
    if (Array.isArray(kids) && kids.length > 0) {
      const next = kids.map(fix).filter((k): k is BuilderNode => k !== null);
      if (next.length !== kids.length || next.some((k, i) => k !== kids[i])) node = { ...node, children: next } as BuilderNode;
    }
    return node;
  };
  return shell.map(fix).filter((k): k is BuilderNode => k !== null);
}
