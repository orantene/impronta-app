/**
 * FreeformLayerName — the single, tested resolver for the operator-facing name
 * (and a per-kind icon key) of a freeform BuilderNode in the layers tree.
 *
 * Job #1 (Wave 1 · 1A): the layers tree used to show a wall of identical
 * "Container" rows — unnavigable. This resolver gives each row a SEMANTIC name
 * derived in priority order:
 *
 *   1. an explicit `name`/role label if the node carries one (curated `section`
 *      nodes store a `label`);
 *   2. the first heading/paragraph/title text the node carries (truncated);
 *   3. for a `section_embed`, the curated section's friendly registry label
 *      ("Featured talent", "Directory", …) via the injected `sectionEmbedLabel`
 *      resolver — falls back to a humanized key;
 *   4. else a friendly kind name from the registry ("Row", "Stack", "Card"…).
 *
 * Pure + dependency-light: it only reads the node + the registry label map, so
 * it is fast (no extra renders) and unit-testable without pulling the section
 * schema graph. The `section_embed` friendly-label lookup is INJECTED (the
 * layers tree passes `sectionEmbedTypeLabel`; tests pass a stub) so this module
 * never imports the heavy section-preset graph itself. It does NOT mutate node
 * data — this is display only.
 *
 * Mirrors the historical `rowLabel` (freeform-layers-tree) and
 * `canvasChildPrimaryLabel` (selection-layer) derivations so the same block
 * reads the same in the tree, the canvas chip, and the inspector.
 */

// TDZ-CYCLE GUARD (B3, the #971 incident class) — this file lives INSIDE the
// `builder-node` package, so it must import its siblings DIRECTLY, never through
// the package barrel `@/lib/site-admin/builder-node`. It used to pull the
// RUNTIME value `BUILDER_NODE_REGISTRY` from the barrel; the barrel does not
// re-export this module today, so no cycle existed yet — but the moment anyone
// adds the mechanical `export * from "./freeform-layer-name"` line, the barrel
// and this module form an intra-package VALUE cycle, `BUILDER_NODE_REGISTRY` is
// in its temporal dead zone at module-eval time, and the chunk throws on load
// (prod admin down, no build/type/lint gate catches it — that is exactly #971).
// `builder-node-barrel-cycle-guard.static.test.ts` now fails on any re-entry.
import { BUILDER_NODE_REGISTRY } from "./registry";
import type { BuilderNode, BuilderNodeKind } from "./types";

/** Max characters of derived text before we truncate with an ellipsis. */
export const LAYER_NAME_MAX = 56;

/** Per-kind icon key used by the layers tree to pick a small scanning glyph. */
export type LayerIconKey =
  | "section"
  | "section_embed"
  | "container_stack"
  | "container_row"
  | "container_grid"
  | "split"
  | "card"
  | "cta_group"
  | "accordion"
  | "accordion_item"
  | "tabs"
  | "tab_panel"
  | "carousel"
  | "masonry"
  | "nav"
  | "heading"
  | "paragraph"
  | "rich_text"
  | "button"
  | "image"
  | "video"
  | "embed"
  | "icon"
  | "pricing_table"
  | "code"
  | "divider"
  | "spacer"
  | "generic";

function truncate(value: string, max: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Strip the inline-rich marker grammar (see rich-editor/transformers/tokens.ts
 * + sections/shared/rich-text.tsx) so the layers tree, canvas chip, and
 * inspector show clean prose: a heading stored as "{b}Bold lead{/b}" or
 * "{accent}Impronta{/accent}" reads as "Bold lead" / "Impronta", not the raw
 * wrapper. A `[label](url)` link collapses to its label. Display-only — never
 * mutates stored node data.
 */
export function stripInlineMarkers(value: string): string {
  return value
    .replace(/\{\/?(?:b|i|accent)\}/g, "")
    .replace(/\{color:#[0-9a-fA-F]{3,8}\}/g, "")
    .replace(/\{\/color\}/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}

/**
 * Job #33 — which responsive breakpoints a freeform node actually overrides.
 * Drives the "behaves differently on mobile" dot on the layers tree (and could
 * back any other at-a-glance indicator). A breakpoint counts as overridden when
 * the node carries a NON-EMPTY bucket for it across any of the three responsive
 * channels:
 *   - `props.style.responsive.{tablet,mobile}`        (per-breakpoint style)
 *   - `props.style.containerQueries.{tablet,mobile}`  (container-query style)
 *   - `props.responsive.{tablet,mobile}`              (container LAYOUT — 2A)
 * Pure + tolerant of partial/legacy shapes (reads via a loose record cast and
 * an emptiness check), so it never throws on an unexpected tree.
 */
export interface ResponsiveOverrideSummary {
  tablet: boolean;
  mobile: boolean;
  any: boolean;
}

function isNonEmptyRecord(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.keys(value as Record<string, unknown>).length > 0
  );
}

export function resolveResponsiveOverrides(
  node: BuilderNode,
): ResponsiveOverrideSummary {
  const props = (node as { props?: Record<string, unknown> }).props ?? {};
  const style = props.style as
    | {
        responsive?: { tablet?: unknown; mobile?: unknown };
        containerQueries?: { tablet?: unknown; mobile?: unknown };
      }
    | undefined;
  const layoutResponsive = props.responsive as
    | { tablet?: unknown; mobile?: unknown }
    | undefined;

  const tablet =
    isNonEmptyRecord(style?.responsive?.tablet) ||
    isNonEmptyRecord(style?.containerQueries?.tablet) ||
    isNonEmptyRecord(layoutResponsive?.tablet);
  const mobile =
    isNonEmptyRecord(style?.responsive?.mobile) ||
    isNonEmptyRecord(style?.containerQueries?.mobile) ||
    isNonEmptyRecord(layoutResponsive?.mobile);

  return { tablet, mobile, any: tablet || mobile };
}

/** Registry label for a kind, with an underscore→space fallback. */
export function kindLabel(kind: BuilderNodeKind): string {
  return BUILDER_NODE_REGISTRY[kind]?.label ?? kind.replace(/_/g, " ");
}

/** Title-case a snake/space key ("featured_talent" → "Featured Talent"). */
function humanizeKey(key: string): string {
  return key
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * How many container levels we scan below a wrapper for a heading to borrow its
 * name. 1 = the wrapper's direct children and grandchildren — enough to catch a
 * "section wrapper → text column → heading" shape (the common case) without a
 * top-of-page wrapper hijacking a heading buried 4+ levels down (those keep a
 * structural Row/Stack/Grid name instead). Display only.
 */
const HEADING_SCAN_DEPTH = 1;

/**
 * The first heading text within `depth` container-levels of `nodes`, breadth
 * first (a closer heading wins over a deeper one). Lets a generic layout
 * container ("Container") read as the section it wraps — "Find the right
 * talent", "How it works" — instead of a wall of identical rows. Tolerant of any
 * node shape (reads `children` via a loose cast); never mutates node data.
 */
function findFirstHeadingText(
  nodes: readonly BuilderNode[],
  depth: number,
): string | undefined {
  for (const child of nodes) {
    if (child.kind === "heading") {
      const text = stripInlineMarkers(child.props.text).trim();
      if (text) return text;
    }
  }
  if (depth <= 0) return undefined;
  for (const child of nodes) {
    const grandchildren = (child as { children?: BuilderNode[] }).children;
    if (grandchildren && grandchildren.length > 0) {
      const found = findFirstHeadingText(grandchildren, depth - 1);
      if (found) return found;
    }
  }
  return undefined;
}

function explicitLayerLabel(node: BuilderNode): string | undefined {
  const label = (node.props as { layerLabel?: string }).layerLabel?.trim();
  if (!label) return undefined;
  return truncate(label, LAYER_NAME_MAX);
}

/**
 * The semantic display name for a freeform layer row.
 *
 * `sectionEmbedLabel` resolves a `section_embed`'s `sectionTypeKey` to a
 * friendly curated-section label; when it returns nothing the key is humanized.
 * Omit it (tests / non-embed contexts) and the humanized key is used.
 */
export function resolveLayerDisplayName(
  node: BuilderNode,
  sectionEmbedLabel?: (sectionTypeKey: string) => string | undefined,
): string {
  const explicit = explicitLayerLabel(node);
  if (explicit) return explicit;

  switch (node.kind) {
    case "heading":
      return truncate(stripInlineMarkers(node.props.text), LAYER_NAME_MAX) || "Heading";
    case "paragraph":
    case "rich_text":
      return (
        truncate(stripInlineMarkers(node.props.text), LAYER_NAME_MAX) ||
        kindLabel(node.kind)
      );
    case "button":
      return truncate(stripInlineMarkers(node.props.label), LAYER_NAME_MAX) || "Button";
    case "image":
      return truncate(node.props.alt ?? "", LAYER_NAME_MAX) || "Image";
    case "icon":
      return truncate(node.props.label ?? "", LAYER_NAME_MAX) || kindLabel(node.kind);
    case "accordion_item":
    case "tab_panel":
      return (
        truncate(stripInlineMarkers(node.props.title), LAYER_NAME_MAX) ||
        kindLabel(node.kind)
      );
    case "divider":
      return node.props.tone === "muted" ? "Divider · muted" : "Divider";
    case "spacer":
      return `Spacer · ${node.props.size.toUpperCase()}`;
    case "section": {
      const explicit = node.props.label?.trim();
      if (explicit) return truncate(explicit, LAYER_NAME_MAX);
      return kindLabel(node.kind);
    }
    case "section_embed": {
      const key = node.props.sectionTypeKey;
      const friendly = sectionEmbedLabel?.(key) ?? humanizeKey(key);
      return friendly || kindLabel(node.kind);
    }
    // BUILDER 2027 · P2A — a native band names itself by its OWN headline, the
    // same way a `container` borrows the heading it wraps. Falling through to
    // the registry label would put four identical "Directory" rows in the
    // navigator of a page that has four scoped directories, which is exactly the
    // wall-of-identical-rows problem this resolver exists to fix.
    case "directory":
    case "featured_talent":
    case "location_map":
    case "sticky_scroll":
    case "stats":
    case "before_after": {
      const headline = node.props.headline?.trim();
      if (headline) return truncate(stripInlineMarkers(headline), LAYER_NAME_MAX);
      return kindLabel(node.kind);
    }
    case "marquee": {
      const first = node.props.items?.[0]?.text?.trim();
      if (first) return truncate(stripInlineMarkers(first), LAYER_NAME_MAX);
      return kindLabel(node.kind);
    }
    case "header_search":
    case "header_account":
    case "header_inquiry":
    case "header_language": {
      // An operator-set label is the point of these widgets — it is what the
      // visitor reads in the header, so it is what the navigator should show.
      const label = node.props.label?.trim();
      if (label) return truncate(stripInlineMarkers(label), LAYER_NAME_MAX);
      return kindLabel(node.kind);
    }
    case "reveal": {
      // A reveal wrapper is invisible by design, so name it by what it wraps —
      // otherwise every reveal on the page reads "Reveal".
      const heading = findFirstHeadingText(node.children, HEADING_SCAN_DEPTH);
      if (heading) return `Reveal · ${truncate(heading, LAYER_NAME_MAX - 9)}`;
      return kindLabel(node.kind);
    }
    case "container": {
      // Borrow the heading the container wraps so the row reads as its section
      // ("Find the right talent") instead of the generic "Container"; else fall
      // back to a structural name keyed off the layout so siblings still differ.
      const heading = findFirstHeadingText(node.children, HEADING_SCAN_DEPTH);
      if (heading) return truncate(heading, LAYER_NAME_MAX);
      return node.props.layout === "row"
        ? "Row"
        : node.props.layout === "grid"
          ? "Grid"
          : "Stack";
    }
    default:
      return kindLabel(node.kind);
  }
}

/**
 * The per-kind icon key for a layer row. Layout containers split by their
 * `layout` prop so a stack, row, and grid read differently at a glance.
 */
export function layerIconKeyForKind(node: BuilderNode): LayerIconKey {
  switch (node.kind) {
    case "container":
      return node.props.layout === "row"
        ? "container_row"
        : node.props.layout === "grid"
          ? "container_grid"
          : "container_stack";
    case "section":
      return "section";
    case "section_embed":
      return "section_embed";
    case "split":
      return "split";
    case "card":
      return "card";
    case "cta_group":
      return "cta_group";
    case "accordion":
      return "accordion";
    case "accordion_item":
      return "accordion_item";
    case "tabs":
      return "tabs";
    case "tab_panel":
      return "tab_panel";
    case "carousel":
      return "carousel";
    case "masonry":
      return "masonry";
    case "nav":
      return "nav";
    case "heading":
      return "heading";
    case "paragraph":
      return "paragraph";
    case "rich_text":
      return "rich_text";
    case "button":
      return "button";
    case "image":
      return "image";
    case "video":
      return "video";
    case "embed":
      return "embed";
    case "icon":
      return "icon";
    case "pricing_table":
      return "pricing_table";
    case "code":
      return "code";
    case "divider":
      return "divider";
    case "spacer":
      return "spacer";
    default:
      return "generic";
  }
}
