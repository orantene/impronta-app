/**
 * WS5 — per-kind LOCALIZABLE prop registry for the page builder.
 *
 * Only TEXT-CONTENT props are translatable per element: visible copy a visitor
 * reads (`text`, `label`, `alt`, `title`, `brand`). URLs / media / ids
 * (`href`, `src`, `brandHref`, `sectionId`) are NOT localizable — they are the
 * same resource in every language, so translating them would just invite broken
 * links. This is intentionally a SUBSET of the field-binding props
 * (`data-bindings.ts` FIELD_BINDING_PROPS_BY_KIND) minus the link/media keys.
 *
 * The per-element overlay (`node.i18n[locale][prop]`) only ever carries keys
 * from this registry, and the Content panel only renders a locale tab-strip for
 * these props. Adding a new translatable prop = one line here.
 *
 * Pure data (no React / no IO) so the canvas renderer, the Content panel, and
 * the published-render parity path can all import it.
 */
import type { BuilderNodeKind } from "@/lib/site-admin/builder-node";

/**
 * Localizable string props per node kind. Order is the Content-panel display
 * order. A kind absent from this map has no inline-translatable text.
 */
export const LOCALIZABLE_PROPS_BY_KIND: Partial<
  Record<BuilderNodeKind, readonly string[]>
> = {
  heading: ["text"],
  paragraph: ["text"],
  rich_text: ["text"],
  button: ["label"],
  image: ["alt"],
  icon: ["label"],
  accordion_item: ["title"],
  tab_panel: ["title"],
  embed: ["title"],
  nav: ["brand"],
  // The form's submit button. Rendered from a TOP-LEVEL prop, so unlike the
  // field labels (which are nested and handled by `nested-i18n`) it needs an
  // entry here or the renderer will not resolve its overlay — a translation
  // that stores fine and never appears.
  form: ["submitLabel"],
  // WS7 Phase 0 — the native data blocks. Their visible copy is authored on
  // TOP-LEVEL props (the renderer resolves each through `resolveNodeLocalizedText`),
  // so every one of them needs a line here or a stored translation would never
  // appear. Hrefs and the derived data itself are deliberately absent: a link is
  // the same resource in every language, and a roster count is a number.
  hero_search: [
    "eyebrow",
    "headline",
    "highlight",
    "subheadline",
    "searchPlaceholder",
    "searchSubmitLabel",
    "primaryCtaLabel",
    "secondaryCtaLabel",
    "statCountLabel",
  ],
  talent_type_grid: [
    "eyebrow",
    "headline",
    "subheadline",
    "seeAllLabel",
    "emptyStateText",
  ],
};

/** The localizable props for a node kind (empty when the kind has none). */
export function localizablePropsForKind(
  kind: BuilderNodeKind,
): readonly string[] {
  return LOCALIZABLE_PROPS_BY_KIND[kind] ?? [];
}

/** Does this kind have any inline-translatable text prop? */
export function kindHasLocalizableProps(kind: BuilderNodeKind): boolean {
  return (LOCALIZABLE_PROPS_BY_KIND[kind]?.length ?? 0) > 0;
}

/** Is `prop` localizable for `kind`? Guards the tab-strip + overlay writes. */
export function isLocalizableProp(
  kind: BuilderNodeKind,
  prop: string,
): boolean {
  return (LOCALIZABLE_PROPS_BY_KIND[kind] ?? []).includes(prop);
}
