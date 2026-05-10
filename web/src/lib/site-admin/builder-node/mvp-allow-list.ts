import { BUILDER_NODE_REGISTRY } from "./registry";
import type { BuilderNodeKind } from "./types";

/**
 * Roadmap §7A MVP element names ↔ `BuilderNodeKind` (see BUILDER_NODE_REGISTRY).
 * Some marketing labels map to existing structural kinds (e.g. Columns → split).
 */
export const MVP_ELEMENT_LIBRARY_KINDS: ReadonlyArray<BuilderNodeKind> = [
  "section",
  "container",
  "split",
  "heading",
  "paragraph",
  "button",
  "image",
  "divider",
  "spacer",
];

/** Section templates use `section`; structural columns use `split` until a dedicated columns primitive ships. */
export const MVP_ROADMAP_LABEL_BY_KIND: Readonly<
  Partial<Record<BuilderNodeKind, string>>
> = {
  section: "Blank / custom section shell",
  container: "Container",
  split: "Columns (split)",
  heading: "Heading",
  paragraph: "Paragraph",
  button: "Button",
  image: "Image",
  divider: "Divider",
  spacer: "Spacer",
};

/** UI grouping for the element insert picker (navigator / canvas). */
export type ElementLibraryCategory =
  | "layout"
  | "structure"
  | "typography"
  | "media"
  | "actions"
  | "utility";

export const ELEMENT_LIBRARY_CATEGORY_ORDER: ReadonlyArray<ElementLibraryCategory> =
  ["layout", "structure", "typography", "media", "actions", "utility"];

export const ELEMENT_LIBRARY_CATEGORY_LABEL: Readonly<
  Record<ElementLibraryCategory, string>
> = {
  layout: "Layout",
  structure: "Structure",
  typography: "Typography",
  media: "Media",
  actions: "Actions",
  utility: "Utility",
};

const KIND_ELEMENT_CATEGORY: Readonly<Record<BuilderNodeKind, ElementLibraryCategory>> =
  {
    section: "layout",
    container: "layout",
    split: "layout",
    carousel: "layout",
    masonry: "layout",
    accordion: "structure",
    tabs: "structure",
    accordion_item: "structure",
    tab_panel: "structure",
    heading: "typography",
    paragraph: "typography",
    image: "media",
    button: "actions",
    divider: "utility",
    spacer: "utility",
  };

export function elementLibraryCategoryForKind(
  kind: BuilderNodeKind,
): ElementLibraryCategory {
  return KIND_ELEMENT_CATEGORY[kind];
}

/** Prefer roadmap-friendly labels where defined; fall back to registry. */
export function elementLibraryPrimaryLabel(kind: BuilderNodeKind): string {
  const roadmap = MVP_ROADMAP_LABEL_BY_KIND[kind];
  if (roadmap) return roadmap;
  return BUILDER_NODE_REGISTRY[kind].label;
}

/**
 * Roadmap / marketing terms that are not their own `BuilderNodeKind` (e.g. “Card”, “CTA group”).
 * Concatenated into element-library search haystacks so operators find primitives by intent.
 */
export function elementLibrarySearchExtraTerms(kind: BuilderNodeKind): string {
  const extras: Partial<Record<BuilderNodeKind, string>> = {
    container: "card cta group stack band wrapper content block panel",
    split: "columns column grid two side by side card row",
    button: "cta call to action link",
    heading: "title headline",
    paragraph: "body copy text",
    image: "photo picture media",
    divider: "rule separator hr",
    spacer: "whitespace gap rhythm",
    accordion: "faq collapse expand",
    tabs: "tabbed panels",
    carousel: "slider slides",
    masonry: "pinterest grid gallery",
  };
  return extras[kind] ?? "";
}

/**
 * Stable ordering for picker tiles: category strip order, then MVP order, then label.
 */
export function sortKindsForElementLibraryCatalog(
  kinds: ReadonlyArray<BuilderNodeKind>,
): BuilderNodeKind[] {
  const mvpIndex = new Map(
    MVP_ELEMENT_LIBRARY_KINDS.map((k, i) => [k, i] as const),
  );
  return [...kinds].sort((a, b) => {
    const ca = KIND_ELEMENT_CATEGORY[a];
    const cb = KIND_ELEMENT_CATEGORY[b];
    const ia = ELEMENT_LIBRARY_CATEGORY_ORDER.indexOf(ca);
    const ib = ELEMENT_LIBRARY_CATEGORY_ORDER.indexOf(cb);
    if (ia !== ib) return ia - ib;
    const ma = mvpIndex.has(a) ? mvpIndex.get(a)! : 999;
    const mb = mvpIndex.has(b) ? mvpIndex.get(b)! : 999;
    if (ma !== mb) return ma - mb;
    return elementLibraryPrimaryLabel(a).localeCompare(elementLibraryPrimaryLabel(b));
  });
}

/**
 * First-ship element catalog: MVP roadmap rows plus layout/group primitives
 * already in the registry (accordion, tabs, …). Unknown future kinds are hidden
 * from the library picker until explicitly allow-listed here.
 */
export const SHIPPED_ELEMENT_INSERT_KINDS: ReadonlyArray<BuilderNodeKind> = [
  ...new Set<BuilderNodeKind>([
    ...MVP_ELEMENT_LIBRARY_KINDS,
    "accordion",
    "accordion_item",
    "tabs",
    "tab_panel",
    "carousel",
    "masonry",
  ]),
];

const SHIPPED_ELEMENT_INSERT_SET = new Set<BuilderNodeKind>(
  SHIPPED_ELEMENT_INSERT_KINDS,
);

export function filterKindsForShippedElementCatalog(
  kinds: ReadonlyArray<BuilderNodeKind>,
): BuilderNodeKind[] {
  return kinds.filter((k) => SHIPPED_ELEMENT_INSERT_SET.has(k));
}
