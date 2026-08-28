/**
 * AI builder generator — the constrained vocabulary the model is allowed to
 * emit, and the safe value-sets the coerce step enforces.
 *
 * The generator lets Claude compose a NOVEL BuilderNode tree from a text brief
 * (unlike the preset re-ranker in `text-to-page.ts`, which only reorders a fixed
 * list of designs). Because a hallucinated kind, a missing required prop, or an
 * out-of-range style value makes `validateBuilderNodeTree` DROP the whole node
 * (and its subtree), we deliberately expose a SMALL, high-coverage subset of the
 * 27 node kinds and a curated slice of the 100+ style props — then the coerce
 * step in `generate-nodes.ts` clamps every value to a set that is guaranteed to
 * pass the registry's Zod schemas. Validation stays the source of truth; this
 * module keeps the model inside the lines so the valid-first-try rate is high.
 *
 * Deliberately EXCLUDED from generation (still accepted if hand-placed):
 *  - id-cross-referencing kinds (accordion/tabs/carousel — defaultOpenItemIds/
 *    defaultTabId the model gets wrong),
 *  - URL-surface kinds (embed/video — host-allowlisted src),
 *  - owner-only `code`, and the data-bound shells (nav/social_links/form/
 *    section_embed/pricing_table) whose nested id-referential schemas are
 *    error-prone. These arrive in later phases.
 *
 * `section_embed` STAYS EXCLUDED, permanently. It is id-referential (it names a
 * curated section by key and carries that section's own config blob), and it
 * re-renders the legacy curated section tree that
 * `docs/ws7-legacy-section-removal-plan.md` deletes in Phase 3. Teaching the
 * model to emit it would invest generation quality in a dying format. The two
 * NATIVE data kinds below are the supported replacement.
 */

import { BUILDER_ICON_NAMES } from "@/lib/site-admin/builder-node/icon-registry";
import { PAGE_DESIGN_PHOTOS } from "@/lib/site-admin/builder-node/page-designs/photos";
import type { BuilderNodeKind } from "@/lib/site-admin/builder-node/types";

/** The node kinds the model may emit. Every one is a real `BUILDER_NODE_REGISTRY` key (asserted by a drift test). */
export const GENERATION_ALLOWED_KINDS = [
  "section",
  "container",
  "split",
  "card",
  "cta_group",
  // Rich, self-contained kinds (Wave 3). accordion_item is child-only (valid
  // ONLY inside an accordion — the drop-policy enforces placement). form and
  // pricing_table carry their own data arrays (no child nodes); coerce validates
  // + clamps every entry. tabs is deliberately NOT here: its defaultTabId is
  // id-referential and gets re-minted by cloneBuilderTreeWithFreshIds, which is
  // error-prone; accordion sidesteps this by not emitting defaultOpenItemIds.
  "accordion",
  "accordion_item",
  "form",
  "pricing_table",
  // WS7 Phase 0 — the two NATIVE, server-data-bound kinds. They meet this
  // file's own inclusion criteria exactly: self-contained (structural leaves,
  // no children to mis-nest), no id cross-referencing the model must invent, no
  // URL surface the model can point anywhere (coerce drops EVERY href — the
  // renderer supplies the tenant-correct `/directory` default), and their live
  // data is resolved SERVER-SIDE off `dataSources` by
  // lib/site-admin/server/native-data-block-sources.ts. Without them an
  // AI-generated agency homepage could not contain the agency's own roster,
  // which was the single biggest quality ceiling on generated pages.
  //
  // The model contributes COPY ONLY on these two. Coerce strips every prop that
  // could steer a query or a link: `searchActionHref`, `selectedTermIds`,
  // `taxonomyTermId`, `imageUrl`, and all chip / CTA / card / see-all hrefs.
  "hero_search",
  "talent_type_grid",
  "heading",
  "paragraph",
  "button",
  "image",
  "icon",
  "divider",
  "spacer",
] as const satisfies ReadonlyArray<BuilderNodeKind>;

export type GenerationKind = (typeof GENERATION_ALLOWED_KINDS)[number];

const GENERATION_ALLOWED_KIND_SET: ReadonlySet<string> = new Set(GENERATION_ALLOWED_KINDS);

export function isGenerationKind(kind: unknown): kind is GenerationKind {
  return typeof kind === "string" && GENERATION_ALLOWED_KIND_SET.has(kind);
}

/** Freeform sections carry this `sectionTypeKey` (matches `createBuilderNode("section")`). */
export const FREEFORM_SECTION_TYPE_KEY = "custom";

/**
 * The model emits an image ROLE, never a URL — coerce maps the role to a real
 * editorial photo already shipping in `/public/marketing/photos` (renderer-safe,
 * zero image-gen cost, and satisfies the "never placeholder boxes" bar). Any
 * model-supplied `src` is discarded, which also blocks SSRF / hotlinking.
 */
export const IMAGE_ROLE_TO_PHOTO = {
  hero: PAGE_DESIGN_PHOTOS.studioScene,
  wide: PAGE_DESIGN_PHOTOS.studioDesk,
  portrait: PAGE_DESIGN_PHOTOS.vocalistPortrait,
  gallery: PAGE_DESIGN_PHOTOS.serviceProsScene,
  team: PAGE_DESIGN_PHOTOS.directorPortrait,
} as const;

export type ImageRole = keyof typeof IMAGE_ROLE_TO_PHOTO;

export const IMAGE_ROLES = Object.keys(IMAGE_ROLE_TO_PHOTO) as ImageRole[];

export const DEFAULT_IMAGE_ROLE: ImageRole = "hero";

export function photoForImageRole(role: unknown): string {
  if (typeof role === "string" && role in IMAGE_ROLE_TO_PHOTO) {
    return IMAGE_ROLE_TO_PHOTO[role as ImageRole];
  }
  return IMAGE_ROLE_TO_PHOTO[DEFAULT_IMAGE_ROLE];
}

// ── WS7 native data blocks: the model's COPY-ONLY contract ──────────────────

/**
 * The `hero_search` layouts the model may pick. Mirrors the registry enum.
 */
export const HERO_SEARCH_LAYOUTS = ["centered", "split", "minimal", "editorial"] as const;

/** `hero_search.statSource`. `tenant_talent_count` is the roster-derived line. */
export const HERO_SEARCH_STAT_SOURCES = ["manual", "tenant_talent_count"] as const;

/** `talent_type_grid.mode`. `dynamic` = derived from THIS tenant's roster. */
export const TALENT_TYPE_GRID_MODES = ["manual", "dynamic"] as const;

/** `talent_type_grid.cardRatio`. Mirrors the registry enum. */
export const TALENT_TYPE_GRID_CARD_RATIOS = ["1/1", "3/4", "4/3", "16/9"] as const;

/** `talent_type_grid.textPosition`. Mirrors the registry enum. */
export const TALENT_TYPE_GRID_TEXT_POSITIONS = ["overlay-bottom", "below"] as const;

/**
 * Props the model is NEVER allowed to contribute on a native data block, even
 * though the registry schema accepts them from a human operator in the
 * inspector. Coerce deletes every one of these unconditionally.
 *
 * Two distinct risks, both closed here:
 *
 *  1. DATA STEERING. `selectedTermIds` and `items[].taxonomyTermId` are real
 *     `taxonomy_terms` ids. `selectedTermIds` is threaded straight into
 *     `fetchTenantTalentDisciplines` (see components/home/homepage-cms-data-sources.ts)
 *     and narrows the resolved set again in the renderer. A model cannot know a
 *     real id, so anything it emits is either a hallucination that silently
 *     empties the grid, or a guessed id from some other tenant's taxonomy. The
 *     tenant gate in native-data-block-sources.ts would still refuse to serve
 *     another tenant's rows, but the model has no business addressing the query
 *     at all — so its ids never reach the resolver.
 *
 *  2. URL / MEDIA SURFACE. Every href on these kinds (`searchActionHref`,
 *     `primaryCtaHref`, `secondaryCtaHref`, `chips[].href`, `seeAllHref`,
 *     `items[].href`) and `items[].imageUrl` (rendered as a raw `<img src>`)
 *     are model-pointable outbound URLs. The renderer already defaults every
 *     one of them to the tenant-prefixed `/directory`, so dropping them costs
 *     nothing and removes the surface entirely — the same reason
 *     `IMAGE_ROLE_TO_PHOTO` discards a model-supplied image `src`.
 *
 * A tenant id or a `dataSources` blob is not listed: neither is part of either
 * node's schema, so the registry would drop the node outright. Coerce is
 * allow-list shaped regardless (it rebuilds props key by key), which is the
 * primary defence; this manifest is the named, test-asserted statement of it.
 */
export const NATIVE_DATA_BLOCK_FORBIDDEN_PROPS = [
  "searchActionHref",
  "primaryCtaHref",
  "secondaryCtaHref",
  "seeAllHref",
  "href",
  "selectedTermIds",
  "taxonomyTermId",
  "imageUrl",
  "imageAlt",
  "imagePosition",
  "tenantId",
  "dataSources",
] as const;

/**
 * Icon names the MODEL may use — a curated subset, not the whole registry.
 *
 * `generate-nodes.ts` inlines this list into every generation prompt. Aliasing
 * it to the full registry was fine at 12 names and is not at 100+: it would put
 * a wall of vocabulary into every call, for tokens, to no benefit — a generated
 * page wants a handful of clear, general glyphs, not the long tail. The
 * operator still picks from everything; `safeIconName` coerces anything the
 * model invents, so a name outside this list can never reach a stored tree.
 */
export const GENERATION_ICON_NAMES = [
  "sparkle",
  "star",
  "heart",
  "check",
  "arrow_right",
  "calendar",
  "map_pin",
  "mail",
  "phone",
  "play",
  "users",
  "camera",
  "search",
  "globe",
  "shield",
  "clock",
  "award",
  "message_circle",
  "image",
  "music",
  "briefcase",
  "user",
  "zap",
  "leaf",
] as const satisfies ReadonlyArray<(typeof BUILDER_ICON_NAMES)[number]>;
export const FALLBACK_ICON_NAME = "sparkle";

export function safeIconName(name: unknown): string {
  return typeof name === "string" && (GENERATION_ICON_NAMES as ReadonlyArray<string>).includes(name)
    ? name
    : FALLBACK_ICON_NAME;
}

/**
 * The curated style props the model may set, each mapped to its EXACT allowed
 * value-set (or validator). Coerce keeps only these keys and only values that
 * pass here, so the resulting `style` object always survives
 * `builderNodeStyleSchema.safeParse` — no oversized free-CSS string can trip a
 * length cap and drop the node.
 */
export const CURATED_STYLE_ENUM_VALUES = {
  align: ["left", "center", "right"],
  size: ["sm", "md", "lg", "xl", "display"],
  tone: ["default", "muted", "strong"],
  maxWidth: ["narrow", "reading", "wide", "full"],
  marginTop: ["none", "s", "m", "l"],
  marginBottom: ["none", "s", "m", "l"],
  paddingX: ["none", "s", "m", "l"],
  paddingY: ["none", "s", "m", "l", "xl"],
  // "contrast" is DELIBERATELY omitted: it is a THEME-RELATIVE band (it renders
  // dark on a light theme but LIGHT on a dark theme), so a model that pairs it
  // with a hardcoded light text color produces light-on-light — unreadable
  // (verified live). Bands must instead be an explicit backgroundColor+textColor
  // PAIR (self-consistent on any theme). "surface" stays: it is a theme-paired
  // raised surface whose foreground the theme keeps readable.
  // "accent" and "muted" ARE allowed (AIQ-13): unlike "contrast" they resolve to
  // a theme-paired background WITH a guaranteed paired foreground in the renderer
  // (accent = --token-color-primary on --token-color-surface-raised text; muted =
  // a blended raised surface on --token-color-ink text), so they are self-
  // consistent on any theme without the model supplying a color pair.
  background: ["none", "surface", "accent", "muted"],
  radius: ["none", "sm", "md", "lg", "pill"],
  objectFit: ["cover", "contain"],
  aspectRatio: ["auto", "1:1", "4:3", "3:4", "16:9", "21:9"],
  textTransform: ["none", "uppercase", "lowercase", "capitalize"],
  fontStyle: ["normal", "italic"],
} as const satisfies Record<string, ReadonlyArray<string>>;

export type CuratedStyleEnumKey = keyof typeof CURATED_STYLE_ENUM_VALUES;

/** Color keys — accept a bounded raw CSS color (hex / rgb / hsl / keyword / var()). */
export const CURATED_STYLE_COLOR_KEYS = ["textColor", "backgroundColor"] as const;

/** `fontWeight` — an integer 100–900. */
export const CURATED_STYLE_FONT_WEIGHT_KEY = "fontWeight";

/** `minHeight` — a bounded raw CSS length the model may set on a hero band (AIQ-7). */
export const CURATED_STYLE_MIN_HEIGHT_KEY = "minHeight";

/** Accept only a short, safe CSS length/viewport unit (blocks calc()/injection). */
export function isSafeMinHeight(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 12 &&
    /^\d{1,4}(px|rem|vh|svh|dvh|%)$/.test(value)
  );
}

/** A conservative color validator: short + only characters that appear in real CSS color values. */
export function isSafeStyleColor(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 48 &&
    /^[a-zA-Z0-9#(),.%\s/-]+$/.test(value)
  );
}
