/**
 * StylePanel · per-kind group recipes — Inspector Reset D3 + D4.
 *
 * THE PROBLEM THIS SOLVES
 * ----------------------
 * Before this module the Style panel rendered SIX accordions for every
 * selection, regardless of what the selected block could actually use:
 * Typography, Dimensions, Appearance, Spacing, Position & layout, Effects &
 * motion — plus a loose Visibility block and a loose Custom CSS disclosure
 * below them. A Container got a "Typography" group holding exactly one
 * control (Align). A Divider got an "Appearance" group with nothing in it
 * that a divider understands. The approved mockup's annotation D is explicit:
 *
 *   "A container gets Layout & spacing, Appearance, Advanced. No 'Typography'
 *    holding a single Align control, no empty 'Appearance' on a divider."
 *
 * THE MODEL
 * ---------
 * Four groups exist, and they render in this fixed order (D4's hierarchy:
 * identity → device → quick styles → 2-3 meaningful groups → one Advanced):
 *
 *   1. text        "Text"              — typography, for kinds that carry copy
 *   2. layout      "Layout & spacing"  — dimensions + spacing, merged
 *   3. appearance  "Appearance"        — fill, corners, border, shadow, surface
 *   4. advanced    "Advanced"          — position, transform, motion, states,
 *                                        container query, visibility, custom CSS
 *
 * A kind declares which of 1-3 it gets. `advanced` is always present: it is
 * the one place the spec-named/rare fields live, and every kind has at least
 * visibility + custom CSS in it, so it is never empty.
 *
 * WHY A DECLARATION AND NOT A DOM COUNT
 * -------------------------------------
 * "Don't render empty groups" could be implemented by counting rendered
 * children, but that requires the group to render its children to find out —
 * and a group whose children are all `null` still costs an accordion header.
 * A declaration is checkable statically (see group-recipes.test.ts), reviewable
 * in one screen, and is the same artefact the PR body reports against.
 *
 * ALIGN IS NOT DELETED, IT IS RE-HOMED
 * ------------------------------------
 * Killing "Typography" on a container must not kill the container's Align
 * control. `layoutGroupOwnsAlign(kind)` is true exactly when the text group is
 * absent, and LayoutSpacingGroup renders the align field itself. Every kind
 * keeps every control it had; only the grouping changes.
 */

import type { BuilderNodeKind } from "@/lib/site-admin/builder-node";

export type StyleGroupId = "text" | "layout" | "appearance" | "advanced";

/** Fixed render order — D4's hierarchy. Advanced is always last. */
export const STYLE_GROUP_ORDER: readonly StyleGroupId[] = [
  "text",
  "layout",
  "appearance",
  "advanced",
] as const;

export const STYLE_GROUP_TITLES: Record<StyleGroupId, string> = {
  text: "Text",
  layout: "Layout & spacing",
  appearance: "Appearance",
  advanced: "Advanced",
};

/**
 * Kinds that lay out CHILDREN, and therefore get the plain-language Arrange
 * controls INSIDE "Layout & spacing" (not as a group of their own — D4 caps
 * how many groups a kind may render, and arrangement is a layout decision, the
 * same reasoning that re-homed Align there). Justify/align/wrap exist for every kind in the style schema, but they
 * only DO anything on a flex/grid parent — offering them on a heading would be
 * three dead controls. Everything else reaches the raw fields in Advanced.
 */
export const ARRANGE_KINDS: ReadonlySet<BuilderNodeKind> = new Set<BuilderNodeKind>([
  "container",
  "split",
  "cta_group",
  "nav",
  "card",
  "masonry",
]);

/**
 * Kinds whose own content is text the operator sets typography on.
 *
 * Excluded on purpose: `container` / `split` / `card` / `cta_group` /
 * `masonry` (their text lives in child nodes, which have their own panel),
 * and `divider` / `spacer` (no text at all). Those kinds got a Typography
 * group holding one Align control — the exact case the mockup names.
 */
const TEXT_KINDS: ReadonlySet<BuilderNodeKind> = new Set<BuilderNodeKind>([
  "heading",
  "paragraph",
  "button",
  "rich_text",
  "code",
  "nav",
  "social_links",
  "form",
  "pricing_table",
  "accordion",
  "accordion_item",
  "tabs",
  "tab_panel",
  "icon",
]);

/**
 * Kinds that paint a surface: fill, corners, border, shadow, background image.
 *
 * Excluded on purpose:
 *  - `spacer` — an invisible gap. Fill/corners/border on it are inert.
 *  - `divider` — its rule colour + weight are DIVIDER props, edited in the
 *    Content panel's divider fields; the generic Appearance group only ever
 *    offered it a background it does not paint. This is the mockup's
 *    "no empty 'Appearance' on a divider".
 *  - `section_embed` — renders another section; it owns no box of its own.
 */
const NO_APPEARANCE_KINDS: ReadonlySet<BuilderNodeKind> =
  new Set<BuilderNodeKind>(["spacer", "divider", "section_embed"]);

/**
 * The group that opens on first sight of this kind (D4: "the first useful
 * group is open"). Always one of the groups the kind actually gets, and never
 * `advanced` — opening Advanced by default would re-create the wall of
 * spec-named fields the reset exists to remove.
 *
 * Text kinds open Text (the operator selected a heading to change the heading).
 * Everything else opens Layout & spacing, which every kind has.
 */
export function firstOpenStyleGroup(kind: BuilderNodeKind): StyleGroupId {
  return TEXT_KINDS.has(kind) ? "text" : "layout";
}

/**
 * The groups this kind renders, in D4 order. `layout` and `advanced` are
 * universal; `text` and `appearance` are per-kind.
 */
export function styleGroupsForKind(
  kind: BuilderNodeKind,
): readonly StyleGroupId[] {
  const groups: StyleGroupId[] = [];
  if (TEXT_KINDS.has(kind)) groups.push("text");
  groups.push("layout");
  if (!NO_APPEARANCE_KINDS.has(kind)) groups.push("appearance");
  groups.push("advanced");
  return groups;
}

export function hasStyleGroup(
  kind: BuilderNodeKind,
  group: StyleGroupId,
): boolean {
  return styleGroupsForKind(kind).includes(group);
}

/**
 * True when Layout & spacing must render the Align control itself, because
 * this kind has no Text group to hold it. Keeps every kind's control set
 * intact across the regroup — see the module header.
 */
export function layoutGroupOwnsAlign(kind: BuilderNodeKind): boolean {
  return !TEXT_KINDS.has(kind);
}

/**
 * D5 — the search terms each group registers, so "Find a setting" still
 * reaches every field after the regroup. These are the UNION of the terms the
 * pre-D4 groups carried, redistributed to wherever the field now lives:
 *
 *   Typography           -> text
 *   Dimensions + Spacing -> layout
 *   Appearance + surface -> appearance
 *   Position & layout,
 *   Effects & motion,
 *   Visibility, Custom CSS -> advanced
 *
 * `group-recipes.test.ts` pins that no term was dropped in the move.
 */
export const STYLE_GROUP_SEARCH_TERMS: Record<
  StyleGroupId,
  readonly string[]
> = {
  text: [
    "font",
    "text size",
    "weight",
    "bold",
    "line height",
    "letter spacing",
    "align",
    "transform",
    "uppercase",
    "text wrap",
    "whitespace",
    "truncate",
    "decoration",
    "tone",
  ],
  layout: [
    "arrange",
    "justify",
    "center",
    "spread",
    "wrap",
    // was Dimensions
    "width",
    "max width",
    "min width",
    "height",
    "max height",
    "min height",
    "exact size",
    // was Spacing
    "padding",
    "margin",
    "gap",
    "space",
    "spacing",
    "inset",
    "gutter",
    "box model",
    "fine-tune spacing",
    // align, when this group owns it
    "align",
  ],
  appearance: [
    "background",
    "fill",
    "color",
    "text color",
    "border",
    "corners",
    "radius",
    "rounded",
    // absorbed from the old Effects group's "Surface & depth" block
    "shadow",
    "box shadow",
    "text shadow",
    "opacity",
    "background image",
    "background size",
    "background position",
    "background repeat",
    "surface",
    "depth",
  ],
  advanced: [
    // was Position & layout
    "position",
    "sticky",
    "fixed",
    "absolute",
    "top",
    "right",
    "bottom",
    "left",
    "z-index",
    "stacking",
    "layer",
    "display",
    "layout",
    "flex",
    "grid",
    "columns",
    "justify",
    "order",
    "overflow",
    "container query",
    // was Effects & motion (minus the surface block, now in Appearance)
    "blur",
    "backdrop",
    // Product names for the glass preset. "blur" / "backdrop" are the CSS
    // spellings; without these, Find-a-setting hid the control from anyone
    // who searched for what the button actually says.
    "glass",
    "glassmorphism",
    "frosted",
    "blend",
    "filter",
    "hover",
    "focus",
    "active",
    "states",
    "transition",
    "animation",
    "entrance",
    "scroll",
    "scroll snap",
    "parallax",
    "reveal",
    "transform",
    "scale",
    "rotate",
    "clip",
    "clip path",
    "mask",
    "outline",
    "cursor",
    "pointer events",
    "user select",
    // loose blocks folded in by D4
    "visibility",
    "hide",
    "hidden",
    "custom css",
    "css",
  ],
};
