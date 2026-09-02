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
 *   - `collectPresentContainerQueryBreakpoints(nodes, components)` — the same
 *     walk for the `@container` tiers the page authors, or `null` for "cannot
 *     prove it, keep everything".
 *   - `buildScopedRendererCss(fullSheet, presentKinds, presentCqBreakpoints)` —
 *     filters the monolithic sheet to the base/shared rules (always emitted)
 *     plus the rule blocks for the present kinds, byte-for-byte preserving
 *     every retained rule.
 *
 * A block is attributed to a kind by TWO signals, both of which must be kept in
 * step with the renderer:
 *   1. a `.site-builder-node--<token>` class, via `KIND_BY_RENDERER_CSS_TOKEN`;
 *   2. a kind-owned class PREFIX, via `KIND_BY_RENDERER_CSS_CLASS_PREFIX` — for
 *      sub-sheets like the carousel's `.site-bn-hero__*` and social feed's
 *      `.sf-*` that never use the `--<token>` shape and so used to be read as
 *      base and shipped to every page.
 * `renderer-css-scope-inverse.test.ts` asserts the converse of all of this: for
 * every fidelity design, every kind on the page still has all of its rules in
 * the scoped sheet. A mis-mapped token fails there loudly rather than shipping
 * a page with missing styles.
 *
 * WHAT IS STILL BASE, AND WHY (measured 2026-09-01, BUILDER 2027 · LANE A)
 * ───────────────────────────────────────────────────────────────────────
 * After this pass the always-shipped base bucket is 46.5 KB per page. It is
 * not an oversight; it is what remains once the safely-attributable rules are
 * attributed. The three items that dominate it, and the reason each is left:
 *
 *   13,451 B  `@media` TABLET style lane   ┐ Keyed on ~100 individual
 *   13,358 B  `@media` MOBILE style lane   ┘ `data-builder-style-<lane>-<attr>`
 *     presence attributes. Scoping these needs the set of ATTRIBUTES the page
 *     emits, and the only honest source for that is `builderNodeStyleAttrs`
 *     itself — a ~100-entry literal map in render.tsx. Re-deriving it here
 *     would be a SECOND copy that drifts, and every drift is a dropped rule on
 *     a live page. The safe whole-lane granularity ("does any node author a
 *     tablet override?") saves nothing, because every fidelity design authors
 *     both lanes. Worth doing only by calling the emitter, which needs a
 *     render-time signal this module does not have.
 *      2,570 B  `@keyframes` — the entrance/hover animation vocabulary. Not
 *     kind-owned (any node may animate), and Phase 7 is about to add to it.
 *      1,290 B  `.site-builder-bg-media__*` — emitted per-node from
 *     `props.backgroundMedia`, a style signal rather than a kind. Scoping it
 *     needs a second presence axis, and the inverse test's kind-driven fixtures
 *     could not cover it.
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
  // ── BUILDER 2027 · P2A — the twelve native kinds ─────────────────────────
  // Every KIND-SPECIFIC `.site-builder-node--<token>` these kinds emit is
  // mapped, so its rule block is DROPPED from the scoped sheet on a page that
  // does not use the kind rather than being misread as always-emit base CSS.
  //
  // The `p2a-*` tokens (`p2a`, `p2a-head`, `p2a-eyebrow`, `p2a-title`,
  // `p2a-copy`, `p2a-empty`, `p2a-sr`, `p2a-ratio`) are deliberately ABSENT.
  // Six bands shared one identical band/head/eyebrow/title/copy rule set, and
  // six copies of it put the FULL sheet ~19 KB over its ceiling. They are one
  // shared set now, which means they belong to no single kind — and an unmapped
  // token is treated as base and always kept, which is exactly right for them
  // (~0.9 KB on every page, against ~13 KB saved on the full sheet). Do not
  // "complete" this map by assigning them a kind: that would drop the shared
  // rules on a page whose only P2A band is a different kind.
  //
  // The shared `header-widget-*` chrome DOES map, to `header_search`, because
  // it belongs to the four header widgets and nothing else;
  // `collectPresentNodeKinds` adds that kind whenever any of them is present.
  "before-after": "before_after",
  "before-after-frame": "before_after",
  "before-after-img": "before_after",
  "before-after-img-after": "before_after",
  "before-after-label": "before_after",
  "before-after-label-after": "before_after",
  "before-after-label-before": "before_after",
  "before-after-range": "before_after",
  "directory": "directory",
  "directory-chip": "directory",
  "directory-chips": "directory",
  "directory-count": "directory",
  "directory-empty": "directory",
  "directory-empty-title": "directory",
  "directory-filter-input": "directory",
  "directory-filters": "directory",
  "directory-grid": "directory",
  "featured-talent": "featured_talent",
  "featured-talent-footer": "featured_talent",
  "featured-talent-grid": "featured_talent",
  "header-language": "header_language",
  "header-language-link": "header_language",
  "header-language-row": "header_language",
  "header-language-sep": "header_language",
  "header-search-input": "header_search",
  "header-widget": "header_search",
  "header-widget-badge": "header_search",
  "header-widget-glyph": "header_search",
  "header-widget-label": "header_search",
  "header-widget-link": "header_search",
  "header-widget-submit": "header_search",
  "location-map": "location_map",
  "location-map-canvas": "location_map",
  "location-map-card": "location_map",
  "location-map-card-address": "location_map",
  "location-map-card-title": "location_map",
  "location-map-cities": "location_map",
  "location-map-city-count": "location_map",
  "location-map-city-link": "location_map",
  "location-map-city-name": "location_map",
  "location-map-city-region": "location_map",
  "location-map-city-soon": "location_map",
  "location-map-embed": "location_map",
  "location-map-frame": "location_map",
  "location-map-pin": "location_map",
  "marquee": "marquee",
  "marquee-item": "marquee",
  "marquee-link": "marquee",
  "marquee-run": "marquee",
  "marquee-sep": "marquee",
  "marquee-tag": "marquee",
  "marquee-track": "marquee",
  "reveal": "reveal",
  "stats": "stats",
  "stats-affix": "stats",
  "stats-caption": "stats",
  "stats-grid": "stats",
  "stats-item": "stats",
  "stats-label": "stats",
  "stats-value": "stats",
  "sticky-scroll": "sticky_scroll",
  "sticky-scroll-block": "sticky_scroll",
  "sticky-scroll-block-body": "sticky_scroll",
  "sticky-scroll-block-title": "sticky_scroll",
  "sticky-scroll-blocks": "sticky_scroll",
  "sticky-scroll-grid": "sticky_scroll",
  "sticky-scroll-image": "sticky_scroll",
  "sticky-scroll-image-empty": "sticky_scroll",
  "sticky-scroll-media": "sticky_scroll",
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

/**
 * Kind-owned sub-sheets that DO NOT use the `.site-builder-node--<token>` class
 * shape at all, and were therefore invisible to the token map above — an
 * unmapped selector is treated as base, so every one of these rules shipped to
 * every page whether or not it could ever match.
 *
 * Measured on the seven fidelity designs (2026-09-01): 6,800 B of
 * `.site-bn-hero__*` and 3,741 B of `.sf-*` were in the "base" bucket of all
 * seven scoped sheets, and NOT ONE of the seven renders either kind. That is
 * 10.3 KB of guaranteed-dead CSS on every page — the single largest miss the
 * token map had.
 *
 * Each prefix is claimed by exactly one renderer, verified by grep:
 *   - `site-bn-hero`  → `carousel.tsx` only (the `variant="hero"` chrome).
 *   - `sf-`           → `social-feed.tsx` only (the social_feed grid/rail).
 * A rule that mixes one of these prefixes WITH a `--<token>` selector keeps the
 * union of both kinds, and "any present → keep" means such a rule survives
 * exactly as it did before. Adding a prefix here can therefore only ever drop
 * a block whose every selector hook belongs to the named kind.
 *
 * Order matters only for readability; the scan checks every entry.
 */
const KIND_BY_RENDERER_CSS_CLASS_PREFIX: ReadonlyArray<
  readonly [prefix: string, kind: BuilderNodeKind]
> = [
  ["site-bn-hero", "carousel"],
  ["sf-", "social_feed"],
];

const RENDERER_CSS_TOKEN_RE = /\.site-builder-node--([a-z0-9-]+)/g;

/** Every class name a block's selectors reference, e.g. `sf-tile`. */
const RENDERER_CSS_CLASS_RE = /\.([a-zA-Z_][\w-]*)/g;

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

    // BUILDER 2027 · P2A — same two carve-outs for the native kinds.
    //
    // (1) `--button`: the directory's search submit and empty-state CTA, the
    //     featured-talent footer CTA, and the location map's CTA are all
    //     `--button` elements the renderer emits itself, with no authored
    //     button node on the page.
    // (2) The four `header_*` widgets share one family of `header-widget-*`
    //     tokens, which the map above assigns to `header_search`. Without this,
    //     a shell carrying only `header_account` would have every shared chrome
    //     rule dropped and the widget would render unstyled.
    if (
      kind === "directory" ||
      kind === "featured_talent" ||
      kind === "location_map" ||
      // A `form` renders its own submit as
      // `<button class="site-builder-node site-builder-node--button">`
      // (render.tsx), with no authored button node anywhere. Found by
      // renderer-css-scope-inverse.test.ts: without this, a contact page whose
      // only button is the form's submit shipped that button UNSTYLED. The
      // fidelity designs all happen to carry a separate button node, which is
      // why every existing suite stayed green.
      kind === "form"
    ) {
      present.add("button");
    }
    if (
      kind === "header_account" ||
      kind === "header_inquiry" ||
      kind === "header_language"
    ) {
      present.add("header_search");
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
 * The two built-in container-query tiers the sheet ships an `@container` block
 * for. Mirrors `builderNodeContainerQueryCss` in render.tsx.
 */
export type ContainerQueryBreakpoint = "tablet" | "mobile";

const CONTAINER_QUERY_BREAKPOINTS: ReadonlyArray<ContainerQueryBreakpoint> = [
  "tablet",
  "mobile",
];

/**
 * Which `@container` tiers this page can actually use.
 *
 * The two `@container` blocks are 24,078 B — 19% of the whole sheet and the
 * largest single item in the always-shipped "base" bucket. Every rule in them
 * is keyed on a `data-builder-style-cq-<tier>-*` presence attribute, and those
 * attributes have EXACTLY ONE emitter: `builderNodeContainerQueryStyleAttrs`
 * in render.tsx, fed only from `style.containerQueries.{tablet,mobile}`. That
 * makes "is this tier authored anywhere on the page?" a precise, one-field
 * question — unlike the `@media` responsive lanes, whose ~100 attributes would
 * need a second copy of the emitter's key map to answer.
 *
 * Returns `null` for "cannot prove it — keep both tiers", which is what the
 * caller must do whenever the walk cannot see the whole truth:
 *
 *   - A node carries a `style.classRef`. A style CLASS can itself carry
 *     `containerQueries` (see `mergeBuilderNodeStyle`), and the class registry
 *     is not resolved into the tree this walk receives. Reading only
 *     `props.style` would miss it and drop a block the page needs.
 *   - The tree is empty / unusable.
 *
 * Mirrors `collectPresentNodeKinds`: same walk shape, same live-resolved
 * component-instance children, same depth cap.
 */
export function collectPresentContainerQueryBreakpoints(
  nodes: ReadonlyArray<BuilderNode>,
  components: ComponentDefinitions = {},
): Set<ContainerQueryBreakpoint> | null {
  if (!Array.isArray(nodes) || nodes.length === 0) return null;
  const present = new Set<ContainerQueryBreakpoint>();
  const MAX_DEPTH = 64;
  let uncertain = false;

  const visit = (node: BuilderNode, depth: number): void => {
    if (uncertain) return;
    if (!node || typeof node !== "object" || depth > MAX_DEPTH) return;
    const style = (
      node as { props?: { style?: Record<string, unknown> } }
    ).props?.style;
    if (style && typeof style === "object") {
      // A linked style class may supply containerQueries this walk cannot see.
      if (style.classRef) {
        uncertain = true;
        return;
      }
      const cq = style.containerQueries as
        | Partial<Record<ContainerQueryBreakpoint, unknown>>
        | undefined;
      if (cq && typeof cq === "object") {
        for (const bp of CONTAINER_QUERY_BREAKPOINTS) {
          const bucket = cq[bp];
          if (
            bucket &&
            typeof bucket === "object" &&
            Object.keys(bucket).length > 0
          ) {
            present.add(bp);
          }
        }
      }
    }

    const resolved = resolveInstanceChildren(node, components);
    if (resolved) {
      for (const child of resolved) visit(child, depth + 1);
    } else if (
      typeof (node as { props?: { instanceOf?: unknown } }).props
        ?.instanceOf === "string"
    ) {
      // A tagged linked instance whose master is NOT in `components`: the
      // subtree that will actually render is invisible here, so we cannot say
      // the page authors no container queries.
      uncertain = true;
      return;
    }
    if ("children" in node && Array.isArray(node.children)) {
      for (const child of node.children) visit(child, depth + 1);
    }
  };

  for (const node of nodes) visit(node, 0);
  return uncertain ? null : present;
}

/**
 * The `@container` tier a wrapper block belongs to, read from the presence
 * attributes its inner rules key on rather than from the `max-width` value, so
 * retuning a breakpoint's px threshold cannot silently unhook the scoping.
 * `null` when the block is not one of the two style-lane wrappers (it targets
 * both tiers, or neither) — in which case it is kept.
 */
function containerBlockBreakpoint(
  block: string,
): ContainerQueryBreakpoint | null {
  const hit = CONTAINER_QUERY_BREAKPOINTS.filter((bp) =>
    block.includes(`data-builder-style-cq-${bp}-`),
  );
  return hit.length === 1 ? hit[0] : null;
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
  // Kind-owned sub-sheets that use their own class prefix instead of the
  // `--<token>` shape. Scanned over SELECTOR TEXT ONLY: a declaration value
  // (`content:".sf-x"`, a url(), a font name) must never be mistaken for a
  // selector, because that would attribute — and so potentially DROP — a block
  // that the prefix does not actually own.
  const selectors = selectorTextOf(block);
  RENDERER_CSS_CLASS_RE.lastIndex = 0;
  while ((match = RENDERER_CSS_CLASS_RE.exec(selectors)) !== null) {
    const className = match[1];
    for (const [prefix, kind] of KIND_BY_RENDERER_CSS_CLASS_PREFIX) {
      if (className.startsWith(prefix)) kinds.add(kind);
    }
  }
  return kinds;
}

/**
 * The SELECTOR text of a block: every run of characters that a `{` closes —
 * selectors and at-rule preludes — with all declaration bodies discarded.
 *
 * `.sf-tile{background:url(a.svg)}` yields `.sf-tile `, never the url. Used by
 * the class-prefix scan above, where a false positive means a dropped rule.
 */
function selectorTextOf(block: string): string {
  let out = "";
  let buf = "";
  for (let i = 0; i < block.length; i += 1) {
    const ch = block[i];
    if (ch === "{") {
      out += `${buf} `;
      buf = "";
    } else if (ch === "}") {
      buf = "";
    } else {
      buf += ch;
    }
  }
  return out;
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
  presentCqBreakpoints: ReadonlySet<ContainerQueryBreakpoint> | null,
): string | null {
  const trimmed = block.trim();
  const atMatch = AT_BLOCK_PREFIX_RE.exec(block);
  const atName = atMatch?.[1]?.toLowerCase();

  // A whole `@container` style-lane wrapper whose tier is not authored anywhere
  // on the page. `null` breakpoints means "could not prove it" → keep both.
  if (atName === "container" && presentCqBreakpoints) {
    const bp = containerBlockBreakpoint(block);
    if (bp && !presentCqBreakpoints.has(bp)) return null;
  }

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
      .map((b) =>
        b.trim() === ""
          ? b
          : keepBlockForKinds(b, presentKinds, presentCqBreakpoints),
      )
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
  /**
   * The `@container` tiers this page authors, from
   * {@link collectPresentContainerQueryBreakpoints}. Omitted or `null` keeps
   * BOTH `@container` blocks — the byte-safe default, so every caller that has
   * not opted in behaves exactly as it did before.
   */
  presentCqBreakpoints?: ReadonlySet<ContainerQueryBreakpoint> | null,
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
    const result = keepBlockForKinds(
      block,
      presentKinds,
      presentCqBreakpoints ?? null,
    );
    if (result !== null) kept += result;
  }
  // Defensive: an empty result would mean the page has styling but we emitted
  // nothing — never ship that, fall back to the full sheet.
  if (kept.trim() === "") return stripCssComments(fullSheet);
  return stripCssComments(kept);
}
