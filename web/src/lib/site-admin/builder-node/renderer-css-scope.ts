/**
 * REND-2 — scope the (~181 KB) builder renderer stylesheet to the node-kinds
 * actually present on a page.
 *
 * Today the full `BUILDER_NODE_RENDERER_CSS` ships on every public render. The
 * sheet is organised as `.site-builder-node--<token>` rule blocks where the
 * token encodes the producing node-kind (e.g. `.site-builder-node--carousel`,
 * `.site-builder-node--pricing-tier`). Most of the weight is kind-specific
 * (carousel, pricing table, nav, social, …) and is dead CSS on a page that does
 * not use that kind.
 *
 * This module provides two pure, surface-agnostic helpers consumed by the
 * single shared `BuilderNodeRendererStyles` component (and re-exported from
 * render.tsx):
 *
 *   - `collectPresentNodeKinds(nodes, components)` — one tree walk (including
 *     children resolved LIVE from a linked-component instance's master) that
 *     returns the exact set of kinds rendered on the page.
 *   - `buildScopedRendererCss(fullSheet, presentKinds)` — filters the monolithic
 *     sheet to the base/shared rules (always emitted) plus the rule blocks for
 *     the present kinds, byte-for-byte preserving every retained rule.
 *
 * BYTE-SAFETY is the prime directive. The filter NEVER edits a declaration; it
 * only DROPS whole rule blocks whose selectors target a kind-token that is
 * absent. If detection is uncertain in any way — an empty kind set, a token the
 * map does not recognise, or any structural anomaly while splitting the sheet —
 * it returns the FULL sheet unchanged, so a needed rule can never be dropped.
 * The scoped sheet is therefore always a superset of the rules a present kind
 * needs.
 */
import type { BuilderNode, BuilderNodeKind } from "./types";
import {
  resolveInstanceChildren,
  type ComponentDefinitions,
} from "./component-instances";

/**
 * The CSS class tokens (`.site-builder-node--<token>`) → producing node-kind.
 *
 * The renderer emits `.site-builder-node--<token>` where `<token>` is the
 * kind-name with underscores hyphenated (`pricing_table` → `pricing-table`,
 * `rich_text` → `rich-text`, `section_embed` → `section-embed`, `cta_group` →
 * `cta-group`) PLUS a family of sub-element tokens (e.g. `carousel-slide`,
 * `pricing-tier`, `nav-menu`, `social-link`). Every token a rule block may
 * reference must be mapped here, or the block is treated as base (kept always,
 * the safe direction).
 *
 * The `live-*` tokens (`live-talent-grid`, `live-chip`, `live-search-shell`,
 * `live-chip-grid`) are produced at render time by a CONTAINER node carrying a
 * live data-binding (featured talent / locations / directory search), not by a
 * distinct kind — so they map to `container`. The directory-search shell also
 * emits a `--button`; `collectPresentNodeKinds` adds `button` to the present
 * set whenever such a container is seen, so the button rules survive even with
 * no authored button-kind node.
 */
const KIND_BY_RENDERER_CSS_TOKEN: Readonly<Record<string, BuilderNodeKind>> = {
  // Structural / layout containers.
  container: "container",
  split: "split",
  // Carousel + every sub-element token.
  carousel: "carousel",
  "carousel-arrow": "carousel",
  "carousel-controls": "carousel",
  "carousel-dot": "carousel",
  "carousel-dots": "carousel",
  "carousel-slide": "carousel",
  "carousel-track": "carousel",
  masonry: "masonry",
  card: "card",
  "cta-group": "cta_group",
  divider: "divider",
  // Text + media leaves.
  heading: "heading",
  paragraph: "paragraph",
  button: "button",
  video: "video",
  embed: "embed",
  icon: "icon",
  code: "code",
  "rich-text": "rich_text",
  // Pricing table + every sub-element token.
  "pricing-table": "pricing_table",
  "pricing-tier": "pricing_table",
  "pricing-tier-header": "pricing_table",
  "pricing-tier-title": "pricing_table",
  "pricing-tier-description": "pricing_table",
  "pricing-price": "pricing_table",
  "pricing-period": "pricing_table",
  "pricing-features": "pricing_table",
  "pricing-feature": "pricing_table",
  "pricing-feature-mark": "pricing_table",
  "pricing-cta": "pricing_table",
  // Nav + every sub-element token.
  nav: "nav",
  "nav-brand": "nav",
  "nav-links": "nav",
  "nav-disclosure": "nav",
  "nav-toggle": "nav",
  "nav-burger": "nav",
  "nav-menu": "nav",
  "nav-has-sub": "nav",
  "nav-sub-toggle": "nav",
  "nav-caret": "nav",
  "nav-submenu": "nav",
  // WS7 Phase 0 — the two NATIVE data blocks + every sub-element token they
  // emit. Unmapped tokens are treated as base (always kept), so a miss here is
  // only a size regression, never a broken block.
  "hero-search": "hero_search",
  "hero-search-inner": "hero_search",
  "hero-search-eyebrow": "hero_search",
  "hero-search-title": "hero_search",
  "hero-search-highlight": "hero_search",
  "hero-search-intro": "hero_search",
  "hero-search-form": "hero_search",
  "hero-search-input": "hero_search",
  "hero-search-ctas": "hero_search",
  "hero-search-chips": "hero_search",
  "hero-search-chip": "hero_search",
  "hero-search-stat": "hero_search",
  "hero-search-stat-item": "hero_search",
  "talent-type-grid": "talent_type_grid",
  "talent-type-grid-head": "talent_type_grid",
  "talent-type-grid-eyebrow": "talent_type_grid",
  "talent-type-grid-title": "talent_type_grid",
  "talent-type-grid-intro": "talent_type_grid",
  "talent-type-grid-items": "talent_type_grid",
  "talent-type-grid-empty": "talent_type_grid",
  "talent-type-card": "talent_type_grid",
  "talent-type-card-media": "talent_type_grid",
  "talent-type-card-title": "talent_type_grid",
  "talent-type-card-desc": "talent_type_grid",
  "talent-type-card-count": "talent_type_grid",
  // Social links + every sub-element token.
  social: "social_links",
  "social-link": "social_links",
  "social-icon": "social_links",
  // Section embed (placeholder shell + label/note) and the live default-tree
  // grids it powers — all produced by section_embed / data-bound containers.
  "section-embed": "section_embed",
  "section-embed-placeholder": "section_embed",
  "section-embed-placeholder-label": "section_embed",
  "section-embed-placeholder-note": "section_embed",
  // Live data-bound grids/shell are rendered by a CONTAINER with a binding.
  "live-talent-grid": "container",
  "live-chip-grid": "container",
  "live-chip": "container",
  "live-search-shell": "container",
};

/**
 * Live data-binding source keys whose CONTAINER render path emits a
 * `--live-search-shell` with a `--button` submit (directory search). When such
 * a container is present we must keep the button rules even if the tree has no
 * authored button-kind node. Featured-talent / locations grids do NOT emit a
 * button, but they DO use `--live-*` tokens which already map to `container`.
 */
const LIVE_BUTTON_SOURCE_KEYS: ReadonlySet<string> = new Set([
  "tenant_directory_search",
]);

const RENDERER_CSS_TOKEN_RE = /\.site-builder-node--([a-z0-9-]+)/g;

/** Read a node's `dataBinding.sourceKey`, if any (container/card/section). */
function nodeDataBindingSourceKey(node: BuilderNode): string | undefined {
  const props = (node as { props?: { dataBinding?: { sourceKey?: string } } })
    .props;
  return props?.dataBinding?.sourceKey;
}

/**
 * Walk the node tree(s) and return the set of node-kinds present, including
 * kinds reached ONLY through a live-resolved linked-component instance (so a
 * page built from saved components never loses styles for instance-resolved
 * kinds). The walk also adds `button` when it sees a container whose live
 * data-binding renders a search-shell submit button.
 *
 * Mirrors the existing `collectBuilderImageMediaIds` walk shape. Pure; tolerant
 * of malformed nodes (a node without a `kind` is skipped). A guard against
 * pathological self-referential component graphs caps recursion depth.
 */
export function collectPresentNodeKinds(
  nodes: ReadonlyArray<BuilderNode>,
  components: ComponentDefinitions = {},
): Set<BuilderNodeKind> {
  const present = new Set<BuilderNodeKind>();
  const MAX_DEPTH = 64;

  const visit = (node: BuilderNode, depth: number): void => {
    if (!node || typeof node !== "object" || depth > MAX_DEPTH) return;
    const kind = (node as { kind?: BuilderNodeKind }).kind;
    if (typeof kind === "string") present.add(kind);

    // A container with a directory-search binding emits a `--button` submit.
    const sourceKey = nodeDataBindingSourceKey(node);
    if (sourceKey && LIVE_BUTTON_SOURCE_KEYS.has(sourceKey)) {
      present.add("button");
    }

    // WS7 Phase 0 — the native data blocks emit `--button` too (the search
    // submit, the CTAs, the "See all" link), with no authored button node
    // anywhere on the page. Same reason as the directory-search container above.
    if (kind === "hero_search" || kind === "talent_type_grid") {
      present.add("button");
    }

    // Live-resolved instance children: a linked instance renders its master's
    // subtree, so those kinds are present on the page even though they are not
    // in the instance node's own `children`. resolveInstanceChildren returns
    // null for a non-instance / missing definition → fall through to children.
    const resolved = resolveInstanceChildren(node, components);
    if (resolved) {
      for (const child of resolved) visit(child, depth + 1);
    }

    if ("children" in node && Array.isArray(node.children)) {
      for (const child of node.children) visit(child, depth + 1);
    }
  };

  for (const node of nodes) visit(node, 0);
  return present;
}

/**
 * Split a CSS string into TOP-LEVEL blocks, each being one rule (`sel{…}`) or
 * one at-rule with its body (`@media …{…}`, `@keyframes …{…}`, `@container
 * …{…}`). Brace-depth aware. Returns `null` if the braces are unbalanced (any
 * anomaly → caller falls back to the full sheet). Inter-block whitespace is
 * attached to the FOLLOWING block so re-joining the kept blocks reproduces the
 * original bytes of every retained block exactly.
 */
function splitTopLevelCssBlocks(css: string): string[] | null {
  const blocks: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < css.length; i += 1) {
    const ch = css[i];
    if (ch === "{") {
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth < 0) return null;
      if (depth === 0) {
        blocks.push(css.slice(start, i + 1));
        start = i + 1;
      }
    }
  }
  if (depth !== 0) return null;
  // Trailing non-block remainder (whitespace) — keep it so a re-join is exact.
  if (start < css.length) blocks.push(css.slice(start));
  return blocks;
}

const AT_BLOCK_PREFIX_RE = /^\s*@([a-z-]+)/i;

/**
 * The kinds a single rule/at-rule block targets via its `.site-builder-node--`
 * tokens. An empty set means the block has NO kind token (only base selectors
 * like `.site-builder-node`, keyframes, etc.) → it is a BASE rule, always kept.
 * Returns `null` if the block references an UNKNOWN token (anomaly → keep, the
 * safe direction, signalled to the caller as "always keep").
 */
function blockTargetKinds(block: string): Set<BuilderNodeKind> | null {
  const kinds = new Set<BuilderNodeKind>();
  let match: RegExpExecArray | null;
  RENDERER_CSS_TOKEN_RE.lastIndex = 0;
  while ((match = RENDERER_CSS_TOKEN_RE.exec(block)) !== null) {
    const token = match[1];
    const kind = KIND_BY_RENDERER_CSS_TOKEN[token];
    if (!kind) return null; // unknown token → keep block (safe)
    kinds.add(kind);
  }
  return kinds;
}

/**
 * Decide whether to keep a block given the present kinds. A block is kept when:
 *   - it has no kind token (base/shared rule), OR
 *   - any of its targeted kinds is present.
 * For an `@media`/`@container` wrapper, the same rule applies to its INNER
 * declarations: keep inner rules that are base or target a present kind; drop
 * the wrapper entirely if every inner rule was dropped. `@keyframes` (and any
 * other at-rule with no kind token) is always kept.
 */
function keepBlockForKinds(
  block: string,
  presentKinds: ReadonlySet<BuilderNodeKind>,
): string | null {
  const trimmed = block.trim();
  const atMatch = AT_BLOCK_PREFIX_RE.exec(block);
  const atName = atMatch?.[1]?.toLowerCase();

  // @media / @container wrappers: filter their inner rules.
  if (atName === "media" || atName === "container") {
    const open = block.indexOf("{");
    const close = block.lastIndexOf("}");
    if (open < 0 || close <= open) return block; // anomaly → keep whole
    const header = block.slice(0, open + 1);
    const inner = block.slice(open + 1, close);
    const footer = block.slice(close); // closing "}" (+ trailing ws)
    const innerBlocks = splitTopLevelCssBlocks(inner);
    if (!innerBlocks) return block; // anomaly → keep whole
    const keptInner = innerBlocks
      .map((b) => (b.trim() === "" ? b : keepBlockForKinds(b, presentKinds)))
      .filter((b): b is string => b !== null);
    // If nothing but whitespace survived, drop the wrapper entirely.
    if (keptInner.every((b) => b.trim() === "")) return null;
    return `${header}${keptInner.join("")}${footer}`;
  }

  // Any other at-rule (e.g. @keyframes) with no kind token → base, always kept.
  if (trimmed.startsWith("@")) {
    const kinds = blockTargetKinds(block);
    if (kinds === null || kinds.size === 0) return block;
    for (const k of kinds) if (presentKinds.has(k)) return block;
    return null;
  }

  // Plain rule block.
  const kinds = blockTargetKinds(block);
  if (kinds === null || kinds.size === 0) return block; // base / unknown → keep
  for (const k of kinds) if (presentKinds.has(k)) return block;
  return null;
}

/**
 * Filter the full renderer sheet to the base rules plus the rules for the
 * present kinds. Returns the FULL sheet unchanged whenever scoping cannot be
 * proven safe: an empty/undefined kind set, an unparseable sheet, or any
 * structural anomaly. The retained rules are byte-for-byte the originals.
 */
/**
 * Strip CSS comments from the sheet that actually ships.
 *
 * The renderer stylesheet is authored with substantial inline commentary — the
 * reason a rule exists, the incident it prevents, the trap it avoids — and that
 * commentary is worth keeping in source. It is not worth shipping: it was ~5.4
 * KB of the emitted sheet, which is the whole of the perf-budget breach it
 * caused. Stripping here keeps every word for the next developer and sends none
 * of it to a visitor, so no rule is lost and no budget is raised.
 *
 * Quote-aware on purpose: a `/*` inside a `content: "..."` value is DATA, not a
 * comment, and blindly regexing comments out would corrupt it. Escapes inside a
 * string are honoured so a trailing backslash cannot swallow the closing quote.
 */
export function stripCssComments(sheet: string): string {
  let out = "";
  let quote: string | null = null;
  for (let i = 0; i < sheet.length; i++) {
    const ch = sheet[i];
    if (quote) {
      out += ch;
      if (ch === "\\" && i + 1 < sheet.length) {
        out += sheet[++i];
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      out += ch;
      continue;
    }
    if (ch === "/" && sheet[i + 1] === "*") {
      const end = sheet.indexOf("*/", i + 2);
      if (end === -1) break; // unterminated comment: drop the remainder
      // Collapse to a single space so `a/*x*/b` cannot fuse into `ab`.
      out += " ";
      i = end + 1;
      continue;
    }
    out += ch;
  }
  return out.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
}

export function buildScopedRendererCss(
  fullSheet: string,
  presentKinds: ReadonlySet<BuilderNodeKind> | null | undefined,
): string {
  // No kinds known (undefined / empty) → conservative full sheet.
  if (!presentKinds || presentKinds.size === 0) return stripCssComments(fullSheet);

  const blocks = splitTopLevelCssBlocks(fullSheet);
  if (!blocks) return stripCssComments(fullSheet); // parse anomaly → full sheet

  let kept = "";
  for (const block of blocks) {
    if (block.trim() === "") {
      kept += block; // preserve inter-block whitespace
      continue;
    }
    const result = keepBlockForKinds(block, presentKinds);
    if (result !== null) kept += result;
  }
  // Defensive: an empty result would mean the page has styling but we emitted
  // nothing — never ship that, fall back to the full sheet.
  if (kept.trim() === "") return stripCssComments(fullSheet);
  return stripCssComments(kept);
}
