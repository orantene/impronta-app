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
  // The reserve block's two authored strings. WITHOUT THIS LINE the renderer
  // resolves both through `resolveNodeLocalizedText`, `isLocalizableProp`
  // returns false, and the overlay is DISCARDED — an operator translates
  // "Reserve" to "Reservar", the Content panel stores it, and the Spanish page
  // still says Reserve. A stored translation that never appears, which is the
  // exact failure the comment above this map warns about.
  //
  // The block's own sentences (refusals, labels, the confirmation) are NOT here
  // and must not be: they ship as en/es inside the island, because a tenant
  // renaming a table must not be able to rewrite the sentence that explains why
  // a booking was refused.
  reserve_table: ["venueName", "ctaVerb"],
  // Apps: the Nail Designer's authored copy. Its own sentences ship en/es inside the island.
  app_nail_designer: ["title", "intro", "ctaLabel"],
  // EVENT PROGRAM: the heading is the only authored string; item text is
  // localised by the row overlay on the server, block chrome ships es/en inline.
  event_program: ["eyebrow", "heading"],
  talent_type_grid: [
    "eyebrow",
    "headline",
    "subheadline",
    "seeAllLabel",
    "emptyStateText",
  ],
  // BUILDER 2027 · P2A. Same rule as the WS7 blocks above: the visible copy is
  // authored on TOP-LEVEL props that the renderer resolves through
  // `resolveNodeLocalizedText`, so every one needs a line here or a stored
  // translation would never appear on the page. Hrefs, image URLs, embed URLs
  // and derived numbers are deliberately absent — a link is the same resource in
  // every language and a roster count is a number.
  marquee: [],
  directory: [
    "eyebrow",
    "headline",
    "copy",
    "filterPlaceholder",
    "filterSubmitLabel",
    "emptyStateTitle",
    "emptyStateText",
    "emptyStateCtaLabel",
  ],
  featured_talent: [
    "eyebrow",
    "headline",
    "copy",
    "ctaLabel",
    "footerCtaLabel",
    "emptyStateText",
  ],
  location_map: [
    "eyebrow",
    "headline",
    "subheadline",
    "overlayTitle",
    "overlayBody",
    "overlayAddress",
    "overlayHours",
    "ctaLabel",
    "emptyStateText",
  ],
  header_search: ["label", "placeholder"],
  header_account: ["label", "signedOutLabel", "signedInLabel"],
  header_inquiry: ["label"],
  header_language: ["label"],
  sticky_scroll: ["eyebrow", "headline"],
  reveal: [],
  stats: ["eyebrow", "headline"],
  // Talent site services block: its renderer already resolves these four via
  // `resolveNodeLocalizedText`, so the overlay must be registered or a stored
  // translation never appears (2026-09-29).
  services_catalog: ["title", "eyebrow", "subtitle", "emptyMessage"],
  before_after: [
    "eyebrow",
    "headline",
    "beforeLabel",
    "afterLabel",
    "sliderLabel",
  ],
  // Ticket #209: the talent-site block kinds whose copy could not hold a
  // per-language version. Each renderer reads these through
  // `localizeBlockNode` (builder-node/block-i18n.ts), which swaps the overlay
  // value in before the block draws. Deliberately ABSENT: hrefs, ids, enums,
  // numbers, `{{token}}` data (names, bio, headshot), reviewer names and
  // quotes (talent data), and the props that already carry an Es/En twin
  // (task_picker `labelEs`/`hintEs`, comp_card `labelEs`/`detailsSummaryEs`).
  // List items (spec_table rows, masthead contents) use dotted keys, see
  // `builder-i18n-list-props.ts`.
  portfolio: ["eyebrow", "title", "emptyMessage", "creditLine"],
  reviews: ["eyebrow", "title"],
  alert_band: ["title", "body", "safetyLabel", "safetyNote", "ctaLabel"],
  task_picker: ["eyebrow", "title"],
  spec_table: ["eyebrow", "title"],
  visit: ["eyebrow", "title", "titleAccent", "mapCaption"],
  masthead: [
    "subline",
    "creditLine",
    "mastRight",
    "coverLine",
    "coverStatement",
    "bio",
    "ctaLabel",
    "bookLabel",
    "contentsTitle",
  ],
  statement_footer: ["statement", "creditLine", "contactLine", "ctaLabel"],
  comp_card: ["eyebrow", "title"],
  // `name` (the business name) stays out: it is the talent's own text.
  utility_bar: ["subtitle", "statusOnLabel", "statusOffLabel", "callLabel", "ctaLabel"],
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
  if (kind === "marquee" && MARQUEE_ITEM_TEXT_KEY.test(prop)) return true;
  return (LOCALIZABLE_PROPS_BY_KIND[kind] ?? []).includes(prop);
}

/**
 * Ticker (marquee) items are an array (`props.items[N].text`) but the overlay is
 * flat strings, so item N's per-language text lives under the DOTTED key
 * `items.N.text`. Matched here rather than listed because the item count is
 * open-ended.
 */
const MARQUEE_ITEM_TEXT_KEY = /^items\.\d+\.text$/;
