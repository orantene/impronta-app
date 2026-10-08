/**
 * TUL-76 — default props for the site shell landmarks (site_header /
 * site_footer). Onboarding used to insert the anchor rows with `{}`, which
 * fails the section schema (`brand` / `legal` are required objects) and
 * showed the owner a raw PROPS_INVALID blocker they did not cause. These
 * helpers are the single source for "valid empty shell props" and are used
 * both when creating the anchors and when validating legacy rows.
 */

export const SHELL_SECTION_TYPES: ReadonlySet<string> = new Set(["site_header", "site_footer"]);

export function isShellSectionType(typeKey: string): boolean {
  return SHELL_SECTION_TYPES.has(typeKey);
}

/** Valid props for a brand-new shell landmark. brand = business name, legal = platform default. */
export function defaultShellProps(typeKey: string, businessName?: string | null): Record<string, unknown> {
  const name = (businessName ?? "").trim().slice(0, 60);
  const brand = name ? { label: name } : {};
  if (typeKey === "site_footer") {
    return { brand, legal: { ...(name ? { copyright: `© ${name}` } : {}), links: [] } };
  }
  return { brand };
}

/**
 * Fill missing brand / legal objects on shell props without touching anything
 * the owner set. Non-shell types are returned unchanged.
 */
export function withShellDefaults(typeKey: string, props: Record<string, unknown>): Record<string, unknown> {
  if (!isShellSectionType(typeKey)) return props;
  const defaults = defaultShellProps(typeKey);
  const next: Record<string, unknown> = { ...props };
  for (const key of Object.keys(defaults)) {
    const cur = next[key];
    if (cur === null || typeof cur !== "object" || Array.isArray(cur)) next[key] = defaults[key];
  }
  if (typeKey === "site_footer") {
    const legal = next.legal as Record<string, unknown>;
    if (!Array.isArray(legal.links)) next.legal = { ...legal, links: [] };
  }
  return next;
}

type TreeNodeLike = { kind?: string; props?: Record<string, unknown>; children?: unknown };

function hasText(v: unknown): boolean {
  return typeof v === "string" && v.replace(/[\u200B-\u200D\uFEFF]/g, "").trim().length > 0;
}

/**
 * Nodes that render a real <h1> from their own props instead of a child heading
 * (render.tsx): a hero carousel in shared content mode (`sharedContent.headingLead`
 * / `headingAccent`, ~5085) and `hero_search` (`headline`, ~5712). Per-slide hero
 * carousels keep their freeform slide headings, found by the child walk.
 */
function nodeEmitsH1FromProps(n: TreeNodeLike): boolean {
  const p = n.props;
  if (!p) return false;
  if (n.kind === "carousel" && p.variant === "hero") {
    const sc = p.sharedContent as { headingLead?: unknown; headingAccent?: unknown } | undefined;
    return !!sc && (hasText(sc.headingLead) || hasText(sc.headingAccent));
  }
  if (n.kind === "hero_search") return hasText(p.headline);
  return false;
}

function isLevelOne(level: unknown): boolean {
  return level === 1 || level === "1";
}

/**
 * A heading supplies text when it has authored text, a live line (`liveText`:
 * a fresh Maison v2 hero headline is empty until render, then follows her
 * profile), or a field binding for `text`.
 */
function headingHasVisibleText(props: Record<string, unknown> | undefined): boolean {
  if (!props) return false;
  if (typeof props.text === "string" && props.text.replace(/[\u200B-\u200D\uFEFF]/g, "").trim()) return true;
  if (typeof props.liveText === "string" && props.liveText.trim()) return true;
  const fb = props.fieldBindings as { text?: unknown } | undefined;
  return typeof fb?.text === "string" && fb.text.trim().length > 0;
}

/**
 * True when the builder tree carries a level-1 heading with text anywhere,
 * including inside hero carousel slides. Hero/carousel headings count as H1.
 */
export function builderTreeHasH1(tree: unknown): boolean {
  if (!Array.isArray(tree)) return false;
  const stack: unknown[] = [...tree];
  while (stack.length > 0) {
    const n = stack.pop() as TreeNodeLike | null;
    if (!n || typeof n !== "object") continue;
    if (nodeEmitsH1FromProps(n)) return true;
    if (n.kind === "heading" && isLevelOne(n.props?.level) && headingHasVisibleText(n.props)) return true;
    if (Array.isArray(n.children)) stack.push(...n.children);
  }
  return false;
}
