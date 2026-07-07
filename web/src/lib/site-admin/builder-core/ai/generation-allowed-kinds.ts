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

/** Icon names the model may use — the full registry enum. Coerce maps anything else to the fallback. */
export const GENERATION_ICON_NAMES = BUILDER_ICON_NAMES;
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
  paddingY: ["none", "s", "m", "l"],
  // "contrast" is DELIBERATELY omitted: it is a THEME-RELATIVE band (it renders
  // dark on a light theme but LIGHT on a dark theme), so a model that pairs it
  // with a hardcoded light text color produces light-on-light — unreadable
  // (verified live). Bands must instead be an explicit backgroundColor+textColor
  // PAIR (self-consistent on any theme). "surface" stays: it is a theme-paired
  // raised surface whose foreground the theme keeps readable.
  background: ["none", "surface"],
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

/** A conservative color validator: short + only characters that appear in real CSS color values. */
export function isSafeStyleColor(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 48 &&
    /^[a-zA-Z0-9#(),.%\s/-]+$/.test(value)
  );
}
