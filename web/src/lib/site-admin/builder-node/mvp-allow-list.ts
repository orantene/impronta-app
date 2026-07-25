import { BUILDER_NODE_REGISTRY } from "./registry";
import type { BuilderNodeKind } from "./types";

/**
 * Roadmap §7A MVP element names ↔ `BuilderNodeKind` (see BUILDER_NODE_REGISTRY).
 * Some marketing labels map to existing structural kinds (e.g. Columns → split).
 */
export const MVP_ELEMENT_LIBRARY_KINDS: ReadonlyArray<BuilderNodeKind> = [
  "section",
  "container",
  "card",
  "cta_group",
  "split",
  "nav",
  "social_links",
  "heading",
  "paragraph",
  "button",
  "image",
  "video",
  "embed",
  // Instagram / TikTok featured post. In the MVP library (not owner-gated):
  // it takes a pasted public post URL, needs no credentials, and is a normal
  // authoring tool rather than a raw-HTML escape hatch like `code`.
  "social_post",
  "icon",
  "pricing_table",
  "rich_text",
  "form",
  "divider",
  "spacer",
];

/**
 * Builder-node `section` rows map CMS slot instances — **not** the CMS section type
 * `blank_section` (registry composition shell).
 *
 * Structural columns use `split` until a dedicated columns primitive ships.
 */
export const MVP_ROADMAP_LABEL_BY_KIND: Readonly<
  Partial<Record<BuilderNodeKind, string>>
> = {
  section: "CMS section row",
  container: "Container",
  card: "Card",
  cta_group: "CTA group",
  split: "Columns (split)",
  nav: "Navigation",
  social_links: "Social links",
  heading: "Heading",
  paragraph: "Paragraph",
  button: "Button",
  image: "Image",
  video: "Video",
  embed: "Embed",
  icon: "Icon",
  pricing_table: "Pricing table",
  rich_text: "Rich text",
  form: "Form",
  code: "Code / HTML",
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
    social_post: "utility",
    container: "layout",
    card: "layout",
    cta_group: "actions",
    split: "layout",
    nav: "layout",
    social_links: "utility",
    carousel: "layout",
    masonry: "layout",
    accordion: "structure",
    tabs: "structure",
    accordion_item: "structure",
    tab_panel: "structure",
    heading: "typography",
    paragraph: "typography",
    image: "media",
    video: "media",
    embed: "media",
    icon: "utility",
    pricing_table: "actions",
    rich_text: "typography",
    form: "actions",
    code: "utility",
    button: "actions",
    divider: "utility",
    spacer: "utility",
    // Surfaced via the picker's dedicated "Tulala" group, not this generic
    // category map; "layout" is a sensible fallback for any non-grouped path.
    section_embed: "layout",
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
 * Extra search tokens for element-library haystacks (supplements label + description).
 */
export function elementLibrarySearchExtraTerms(kind: BuilderNodeKind): string {
  const extras: Partial<Record<BuilderNodeKind, string>> = {
    section: "cms slot composition outline layer tree wrapper",
    container: "stack band wrapper content block panel",
    card: "tile panel boxed elevated outline band content",
    cta_group: "cta call to action buttons row actions conversion",
    split: "columns column grid two side by side card row",
    nav: "navigation nav menu header hamburger links menu bar topbar mobile responsive dropdown mega submenu",
    social_links: "social links instagram tiktok facebook youtube linkedin x twitter whatsapp email icons footer follow",
    button: "cta call to action link",
    heading: "title headline",
    paragraph: "body copy text",
    image: "photo picture media",
    video: "movie reel clip media poster autoplay loop controls",
    embed: "iframe youtube vimeo maps calendly booking widget embed",
    icon: "svg symbol pictogram check star heart arrow sparkle",
    pricing_table: "pricing plans tiers packages features check marks conversion",
    rich_text: "body copy rich text bold italic inline links markdown",
    form: "form contact lead newsletter signup input email field submit message inquiry capture",
    code: "code html css raw markup snippet iframe embed sandbox custom widget",
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
    // `code` is a shipped, registered kind (renders via the sandboxed iframe),
    // but it is deliberately NOT in MVP_ELEMENT_LIBRARY_KINDS — it stays hidden
    // from ordinary editors and is surfaced only through the owner-only gate
    // (see OWNER_ONLY_ELEMENT_INSERT_KINDS + gateNestedInsertKinds).
    "code",
    // `section_embed` (Tulala component) is shipped + droppable, but the picker
    // surfaces it ONLY through the curated "Tulala" entries (Directory /
    // Featured talent / Booking / CTA) — never as a bare generic pill. Keeping
    // it in the shipped catalog lets it survive the allow-list filter so those
    // curated entries reach the picker's `allowedKinds` gate.
    "section_embed",
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

/**
 * Kinds that only a platform owner (super_admin) may INSERT, regardless of
 * workspace plan or editor role. Raw-HTML `code` lives here: even though its
 * render path is sandboxed, dropping arbitrary HTML/CSS is a privileged,
 * abuse-sensitive capability we keep off the standard editor surface until
 * reviewed. The render/validation layers still accept the kind (so existing
 * owner-authored blocks publish and load); this gate only governs *insertion*.
 */
export const OWNER_ONLY_ELEMENT_INSERT_KINDS: ReadonlyArray<BuilderNodeKind> = [
  "code",
];

const OWNER_ONLY_ELEMENT_INSERT_SET = new Set<BuilderNodeKind>(
  OWNER_ONLY_ELEMENT_INSERT_KINDS,
);

export function isOwnerOnlyElementKind(kind: BuilderNodeKind): boolean {
  return OWNER_ONLY_ELEMENT_INSERT_SET.has(kind);
}

/**
 * Strip owner-only insert kinds unless the current editor is a platform owner.
 * Default-deny: non-owners (and any call site that doesn't pass the flag) never
 * see them.
 */
export function filterKindsForOwnerOnlyAccess(
  kinds: ReadonlyArray<BuilderNodeKind>,
  canInsertOwnerOnly: boolean,
): BuilderNodeKind[] {
  if (canInsertOwnerOnly) return [...kinds];
  return kinds.filter((k) => !OWNER_ONLY_ELEMENT_INSERT_SET.has(k));
}
