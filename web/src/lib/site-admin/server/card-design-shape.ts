/**
 * Card-design shape + pure projection (P3).
 *
 * Plain types + a framework-free projection function — NO `server-only`,
 * NO `unstable_cache`, NO Supabase — so:
 *   - the server resolver (`card-design-resolver.ts`) imports the projection
 *     and wraps it in `unstable_cache`, and
 *   - client components (the marketing directory card) import the `CardDesign`
 *     TYPE without dragging server-only modules into the client bundle.
 *
 * `CardDesign` is the per-tenant card-token subset the `<html>` token cascade
 * cannot reach. The storefront paints `--token-card-*` via the global cascade,
 * but two surfaces escape it:
 *   - the marketing global directory is CROSS-TENANT (one page, many tenants),
 *     so no single `<html>` token scope can be right for every row, and
 *   - the client dashboard renders talent from many agencies under the
 *     platform shell.
 *
 * For those, each card root must carry its OWN agency's `--token-card-*` vars
 * inline. This module projects the live `theme_json` card subset into a
 * serializable `CardDesign`; the consumer spreads it as inline vars.
 */

/**
 * The directory card families a tenant can pick. Mirrors the registry enum on
 * `template.directory-card-family` (widened in P2) — kept as a local literal
 * set (not imported from the registry) so this module stays framework- AND
 * registry-free and safe to import into the client bundle. The card-kits test
 * already guards the registry enum; `cardDesignFamilies` here is asserted to
 * match it in `card-design-resolver.test.ts`.
 *
 * `classic` is the platform default, so a tenant that never published a Card
 * Design resolves to it.
 */
export const CARD_DESIGN_FAMILIES = [
  "classic",
  "service-professional",
  "editorial-bridal",
  "editorial-noir",
  "magazine",
  "minimal-portrait",
] as const;

export type CardDesignFamily = (typeof CARD_DESIGN_FAMILIES)[number];

export const CARD_DESIGN_DEFAULT_FAMILY: CardDesignFamily = "classic";

/**
 * Serializable per-tenant card design. Colors are optional — an unset color
 * means "inherit the theme default" (the `<TalentCard>` var fallback chain
 * `var(--token-card-*, var(--token-color-*, …))` handles the inheritance), so
 * we never emit a `--token-card-*` var that would pin a stale color. `family`
 * is always present (defaults to `classic`).
 */
export type CardDesign = {
  /** `card.surface` — card media / panel ground. */
  surface?: string;
  /** `card.name-color` — talent name color (editorial families). */
  nameColor?: string;
  /** `card.muted` — secondary / muted card text. */
  muted?: string;
  /** `card.price-color` — the "From $X" chip. */
  priceColor?: string;
  /** `template.directory-card-family`. */
  family: CardDesignFamily;
  /**
   * `directory.card.profile-popup`. "off" forces full-page navigation on every
   * directory card site-wide — a CEILING: a section may choose the full page on
   * its own, but cannot force the popup back on once the tenant disables it.
   */
  profilePopup?: "on" | "off";
};

/** Registry token key → `CardDesign` color field. */
const CARD_COLOR_KEYS = {
  surface: "card.surface",
  nameColor: "card.name-color",
  muted: "card.muted",
  priceColor: "card.price-color",
} as const;

const PROFILE_POPUP_KEY = "directory.card.profile-popup";

const CARD_FAMILY_KEY = "template.directory-card-family";

const CARD_FAMILY_SET: ReadonlySet<string> = new Set(CARD_DESIGN_FAMILIES);

function isCardFamily(value: string): value is CardDesignFamily {
  return CARD_FAMILY_SET.has(value);
}

/**
 * Project a tenant's LIVE `theme_json` into a serializable `CardDesign`.
 *
 * Pure: no DB, no cache, no framework. Reads only the card-token subset
 * (`card.surface`, `card.name-color`, `card.muted`, plus
 * `template.directory-card-family`). Non-string values, empty strings, and
 * keys outside the subset are ignored. An invalid / missing family falls back
 * to `classic`. Never throws.
 *
 * Empty colors are intentionally OMITTED (not emitted as `""`) so the consumer
 * skips the inline var and the `<TalentCard>` fallback chain inherits the theme
 * color instead of pinning a blank value.
 */
export function projectCardDesign(
  themeJson: Record<string, unknown> | null | undefined,
): CardDesign {
  const live =
    themeJson && typeof themeJson === "object" ? themeJson : {};

  const familyRaw = live[CARD_FAMILY_KEY];
  const family =
    typeof familyRaw === "string" && isCardFamily(familyRaw)
      ? familyRaw
      : CARD_DESIGN_DEFAULT_FAMILY;

  const out: CardDesign = { family };
  for (const [field, tokenKey] of Object.entries(CARD_COLOR_KEYS) as Array<
    [keyof typeof CARD_COLOR_KEYS, string]
  >) {
    const value = live[tokenKey];
    if (typeof value === "string" && value.trim().length > 0) {
      out[field] = value;
    }
  }
  const popup = live[PROFILE_POPUP_KEY];
  if (popup === "off" || popup === "on") out.profilePopup = popup;
  return out;
}

/**
 * The default design for a tenant that has never published a Card Design (or
 * whose row couldn't be read). `classic` family, no color pins → every card
 * inherits its theme colors through the `<TalentCard>` var fallback chain.
 */
export const DEFAULT_CARD_DESIGN: CardDesign = {
  family: CARD_DESIGN_DEFAULT_FAMILY,
};

/**
 * Project a `CardDesign` into the inline `--token-card-*` CSS custom
 * properties a card root spreads into its `style`. Only set colors are
 * emitted (unset colors inherit through the cascade fallback). The family is
 * NOT a CSS var — callers pass it via the `data-token-template-directory-card-family`
 * attribute (matching the global cascade's `designTokensToDataAttrs`).
 *
 * Returned as `React.CSSProperties`-compatible so it spreads cleanly into a
 * `style={...}` prop alongside other declarations.
 */
export function cardDesignToCssVars(
  design: CardDesign,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (design.surface) out["--token-card-surface"] = design.surface;
  if (design.nameColor) out["--token-card-name-color"] = design.nameColor;
  if (design.muted) out["--token-card-muted"] = design.muted;
  if (design.priceColor) out["--token-card-price-color"] = design.priceColor;
  return out;
}
