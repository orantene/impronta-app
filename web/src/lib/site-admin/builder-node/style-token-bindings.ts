/**
 * Wave 3 · Item 3A — TOKEN BINDING for freeform style values.
 *
 * A freeform style prop normally holds a RAW value (`#C9A227`, `60px`,
 * `"Playfair Display", serif`). A TOKEN REFERENCE lets that prop instead BIND
 * to a Theme design token, so when the agency changes the theme the bound prop
 * cascades automatically.
 *
 * ── Encoding ───────────────────────────────────────────────────────────────
 * A token reference is a STRING SENTINEL:  `token:<key>`
 *
 *     "token:color.primary"
 *     "token:color.accent"
 *     "token:typography.heading-font-family"
 *
 * Why a string sentinel (not a tagged object): the color / font-family style
 * fields are already `z.string()` at every layer of `BuilderNodeStyleValue`
 * (base + responsive.tablet/mobile + containerQueries + hover). A sentinel
 * needs ZERO structural schema change across those ~6 nested shapes, keeps the
 * presentation→style passthrough working unchanged, and is trivially
 * back-compat: ANY value that does not start with `token:` (every hex, rgb(),
 * hsl(), CSS keyword, and even a pre-existing literal `var(--token-…)` string)
 * is a raw value and is returned untouched. The flagship page-design uses only
 * raw values, so it renders BYTE-IDENTICAL.
 *
 * ── Resolution ─────────────────────────────────────────────────────────────
 * At render time `resolveStyleTokenRef(value)` maps a sentinel to the matching
 * CSS custom property with the token's platform default as the fallback:
 *
 *     "token:color.primary"  →  "var(--token-color-primary, #111111)"
 *
 * The CSS var is published on the storefront root by `designTokensToCssVars`
 * (see `tokens/resolve.ts`), so a live theme change recolours every bound node
 * with no re-save. The fallback keeps a bound node legible even in a render
 * context that has not injected the token vars (tests, tenant-less previews).
 *
 * ── Single source of truth ─────────────────────────────────────────────────
 * The bindable token catalog is DERIVED from the token registry +
 * `COLOR_VAR_NAMES` (the same map `designTokensToCssVars` projects), never
 * hardcoded. Adding a color token to the registry automatically makes it
 * bindable here and in the inspector picker.
 */

import { COLOR_VAR_NAMES } from "@/lib/site-admin/tokens/resolve";
import { TOKEN_REGISTRY } from "@/lib/site-admin/tokens/registry";

/** The `token:` prefix that marks a style value as a token reference. */
export const STYLE_TOKEN_REF_PREFIX = "token:";

/**
 * The categories a bindable token belongs to. Each kind is offered to a
 * matching set of style props by the inspector + drives nothing at render
 * (resolution is kind-agnostic — see `resolveStyleTokenRef`).
 *
 *   color        → textColor / backgroundColor / borderColor / accent / caret …
 *   font-family  → fontFamily
 *   radius       → borderRadius
 *   shadow       → boxShadow
 *   spacing      → padding* / margin* / gap
 *   font-size    → fontSize (per-heading type-scale)
 */
export type StyleBindableTokenKind =
  | "color"
  | "font-family"
  | "radius"
  | "shadow"
  | "spacing"
  | "font-size";

/** A bindable Theme token offered to a freeform style prop. */
export interface StyleBindableToken {
  /** Registry key, e.g. `"color.primary"`. The sentinel is `token:<key>`. */
  key: string;
  /** Human label for the inspector (from the registry). */
  label: string;
  /** CSS custom property the key projects to (from `COLOR_VAR_NAMES`). */
  cssVar: string;
  /** Platform default used as the `var(--…, fallback)` fallback. */
  fallback: string;
  /** Which style fields this token is sensible to bind to. */
  kind: StyleBindableTokenKind;
}

// Friendly fallbacks for the two font-family bindings. These bind to the
// storefront's RESOLVED font vars (`--site-heading-font` / `--site-body-font`,
// the consumable end of the theme font chain) rather than the raw override
// token, so "use the theme heading font" works even when no explicit
// font-family override token is set. The fallback mirrors token-presets.css.
const FONT_FAMILY_BINDINGS: ReadonlyArray<StyleBindableToken> = [
  {
    key: "typography.heading-font-family",
    label: "Heading font",
    cssVar: "--site-heading-font",
    fallback: "inherit",
    kind: "font-family",
  },
  {
    key: "typography.body-font-family",
    label: "Body font",
    cssVar: "--site-body-font",
    fallback: "inherit",
    kind: "font-family",
  },
];

/**
 * Wave 3 · 3A-extended — DERIVED THEME bindings for spacing / radius / shadow
 * (and per-heading type-scale).
 *
 * Unlike colors + font-families, the theme's radius / shadow / spacing tokens
 * are ENUM presets (`radius.scale-preset` = sharp|soft|pillowy|pill, …) that
 * project to a `data-token-*` ATTRIBUTE, NOT a single CSS value — so they can't
 * be bound directly. Each preset rule in `token-presets.css` instead flips a
 * *consumable* CSS custom property (`--site-radius-base`, `--site-shadow-soft`,
 * `--site-section-y`, …). Those consumable vars ARE single CSS values, and they
 * update LIVE when the agency changes the corresponding preset.
 *
 * So we expose a small catalog of synthetic bindable tokens whose `cssVar` is
 * the consumable `--site-*` var. Binding e.g. a card's `borderRadius` to
 * `token:radius.base` emits `var(--site-radius-base, 0.5rem)` — and a live
 * "Radius scale → pill" theme change re-rounds it with no re-save.
 *
 * These keys (`radius.base`, `shadow.soft`, `space.section-y`, …) are NOT
 * registry token keys; they name a RESOLVED consumable var. The fallbacks
 * mirror the `html { … }` defaults block at the top of `token-presets.css`, so
 * a bound prop stays legible in a render context that hasn't injected the
 * preset CSS (tests / tenant-less previews) — exactly like the color/font path.
 *
 * Resolution stays byte-identical: `resolveStyleTokenRef` just emits
 * `var(${cssVar}, ${fallback})` for ANY key in the catalog. No new code path.
 */
const DERIVED_THEME_BINDINGS: ReadonlyArray<StyleBindableToken> = [
  // ── Radius (consumable vars flipped by radius.scale-preset / radius.base) ──
  {
    key: "radius.sm",
    label: "Radius — small",
    cssVar: "--site-radius-sm",
    fallback: "0.3rem",
    kind: "radius",
  },
  {
    key: "radius.base",
    label: "Radius — base",
    cssVar: "--site-radius-base",
    fallback: "0.5rem",
    kind: "radius",
  },
  {
    key: "radius.lg",
    label: "Radius — large",
    cssVar: "--site-radius-lg",
    fallback: "1rem",
    kind: "radius",
  },
  {
    key: "radius.pill",
    label: "Radius — pill",
    cssVar: "--site-radius-pill",
    fallback: "999px",
    kind: "radius",
  },
  // ── Shadow (consumable vars flipped by shadow.preset) ───────────────────
  {
    key: "shadow.soft",
    label: "Shadow — soft",
    cssVar: "--site-shadow-soft",
    fallback: "0 6px 16px -8px rgba(17, 17, 17, 0.12)",
    kind: "shadow",
  },
  {
    key: "shadow.ambient",
    label: "Shadow — ambient",
    cssVar: "--site-shadow-ambient",
    fallback: "0 20px 42px -24px rgba(17, 17, 17, 0.18)",
    kind: "shadow",
  },
  // ── Spacing (consumable vars flipped by density.* presets) ──────────────
  {
    key: "space.section-y",
    label: "Spacing — section rhythm",
    cssVar: "--site-section-y",
    fallback: "72px",
    kind: "spacing",
  },
  // ── Type scale (per-heading size overrides; raw CSS length vars) ─────────
  // These bind to the free type-scale override vars projected by
  // COLOR_VAR_NAMES (`--token-typography-h{N}-size`). Empty when unset → the
  // fallback (`inherit`) keeps the heading on its preset scale.
  {
    key: "typography.h1-size",
    label: "Type — H1 size",
    cssVar: "--token-typography-h1-size",
    fallback: "inherit",
    kind: "font-size",
  },
  {
    key: "typography.h2-size",
    label: "Type — H2 size",
    cssVar: "--token-typography-h2-size",
    fallback: "inherit",
    kind: "font-size",
  },
  {
    key: "typography.h3-size",
    label: "Type — H3 size",
    cssVar: "--token-typography-h3-size",
    fallback: "inherit",
    kind: "font-size",
  },
  {
    key: "typography.body-size",
    label: "Type — body size",
    cssVar: "--token-typography-body-size",
    fallback: "inherit",
    kind: "font-size",
  },
];

/**
 * Build the bindable-color catalog from the registry's `color.*` tokens that
 * have a CSS-var projection. Derived once at module load — the registry is a
 * static constant. Ordered to match the registry declaration order.
 */
function buildColorBindings(): ReadonlyArray<StyleBindableToken> {
  const out: StyleBindableToken[] = [];
  for (const spec of Object.values(TOKEN_REGISTRY)) {
    if (spec.scope !== "color") continue;
    const cssVar = COLOR_VAR_NAMES[spec.key];
    if (!cssVar) continue; // no projection → not bindable.
    out.push({
      key: spec.key,
      label: spec.label,
      cssVar,
      fallback: spec.defaultValue,
      kind: "color",
    });
  }
  return out;
}

const COLOR_BINDINGS = buildColorBindings();

const RADIUS_BINDINGS = DERIVED_THEME_BINDINGS.filter((t) => t.kind === "radius");
const SHADOW_BINDINGS = DERIVED_THEME_BINDINGS.filter((t) => t.kind === "shadow");
const SPACING_BINDINGS = DERIVED_THEME_BINDINGS.filter((t) => t.kind === "spacing");
const FONT_SIZE_BINDINGS = DERIVED_THEME_BINDINGS.filter(
  (t) => t.kind === "font-size",
);

/**
 * Every bindable token (colors + font families + derived spacing / radius /
 * shadow / type-scale). The order is: colors, fonts, then the derived theme
 * vars — so the color path stays first (no reordering of the existing catalog).
 */
export const STYLE_BINDABLE_TOKENS: ReadonlyArray<StyleBindableToken> = [
  ...COLOR_BINDINGS,
  ...FONT_FAMILY_BINDINGS,
  ...DERIVED_THEME_BINDINGS,
];

/** Bindable color tokens — for the inspector color pickers. */
export const STYLE_BINDABLE_COLOR_TOKENS: ReadonlyArray<StyleBindableToken> =
  COLOR_BINDINGS;

/** Bindable font-family tokens — for the inspector font-family control. */
export const STYLE_BINDABLE_FONT_FAMILY_TOKENS: ReadonlyArray<StyleBindableToken> =
  FONT_FAMILY_BINDINGS;

/** Bindable radius tokens — for the inspector border-radius control. */
export const STYLE_BINDABLE_RADIUS_TOKENS: ReadonlyArray<StyleBindableToken> =
  RADIUS_BINDINGS;

/** Bindable shadow tokens — for the inspector box-shadow control. */
export const STYLE_BINDABLE_SHADOW_TOKENS: ReadonlyArray<StyleBindableToken> =
  SHADOW_BINDINGS;

/** Bindable spacing tokens — for the inspector padding / margin / gap rows. */
export const STYLE_BINDABLE_SPACING_TOKENS: ReadonlyArray<StyleBindableToken> =
  SPACING_BINDINGS;

/** Bindable type-scale tokens — for the inspector font-size control. */
export const STYLE_BINDABLE_FONT_SIZE_TOKENS: ReadonlyArray<StyleBindableToken> =
  FONT_SIZE_BINDINGS;

const TOKEN_BY_KEY: ReadonlyMap<string, StyleBindableToken> = new Map(
  STYLE_BINDABLE_TOKENS.map((t) => [t.key, t]),
);

/** True when a style value is a `token:<key>` reference (not a raw value). */
export function isStyleTokenRef(value: string | undefined | null): value is string {
  return typeof value === "string" && value.startsWith(STYLE_TOKEN_REF_PREFIX);
}

/**
 * The sentinel string for a given token key (`"token:color.primary"`). Used by
 * the inspector to emit a binding.
 */
export function styleTokenRef(key: string): string {
  return `${STYLE_TOKEN_REF_PREFIX}${key}`;
}

/**
 * Parse a `token:<key>` sentinel into its bindable-token definition, or null
 * when the value is raw / the key is not a known bindable token. The inspector
 * uses this to show the bound token's label + swatch.
 */
export function parseStyleTokenRef(
  value: string | undefined | null,
): StyleBindableToken | null {
  if (!isStyleTokenRef(value)) return null;
  const key = value.slice(STYLE_TOKEN_REF_PREFIX.length);
  return TOKEN_BY_KEY.get(key) ?? null;
}

/**
 * True when `key` names a token that can be bound — registry color / font OR a
 * derived theme var (radius / shadow / spacing / type-scale). Used by the
 * authoring-time schema refinement so a typo'd binding is rejected on save.
 */
export function isBindableTokenKey(key: string): boolean {
  return TOKEN_BY_KEY.has(key);
}

/**
 * The bindable tokens offered to a given style prop. The inspector calls this
 * to populate the "Bind to theme" picker for a row. Returns an empty list for a
 * prop with no sensible theme binding.
 */
const PROP_BINDABLE_TOKENS: Readonly<
  Record<string, ReadonlyArray<StyleBindableToken>>
> = {
  borderRadius: RADIUS_BINDINGS,
  boxShadow: SHADOW_BINDINGS,
  // Spacing props — padding, margin (free), and gap all bind to the section
  // rhythm var. (A single spacing token today; the list grows as more
  // consumable spacing vars are exposed.)
  paddingTop: SPACING_BINDINGS,
  paddingRight: SPACING_BINDINGS,
  paddingBottom: SPACING_BINDINGS,
  paddingLeft: SPACING_BINDINGS,
  marginTopFree: SPACING_BINDINGS,
  marginRightFree: SPACING_BINDINGS,
  marginBottomFree: SPACING_BINDINGS,
  marginLeftFree: SPACING_BINDINGS,
  gap: SPACING_BINDINGS,
  fontSize: FONT_SIZE_BINDINGS,
};

/** Bindable tokens for a style prop (radius / shadow / spacing / font-size). */
export function bindableTokensForStyleProp(
  prop: string,
): ReadonlyArray<StyleBindableToken> {
  return PROP_BINDABLE_TOKENS[prop] ?? [];
}

/**
 * Conservative "rebind raw → exact theme token" map. Built once from the
 * derived + color catalog: a RAW value that is byte-identical to a bindable
 * token's fallback (e.g. `"0.5rem"` → `radius.base`, `"#0ea5e9"` →
 * `color.accent`) maps to that token key. Only EXACT matches are eligible — we
 * never coerce a near value. Colors normalise case (hex is case-insensitive)
 * but nothing else.
 *
 * When two tokens share a fallback (e.g. `color.primary` + `color.ink` are both
 * `#111111`, or `radius.pill` + several presets are `999px`), the FIRST in
 * catalog order wins — a deterministic, documented choice. Font-family / shadow
 * fallbacks are matched verbatim.
 */
function buildExactRawToTokenMap(): ReadonlyMap<string, string> {
  const out = new Map<string, string>();
  for (const t of STYLE_BINDABLE_TOKENS) {
    // The font/spacing "inherit" sentinel fallback is not a meaningful raw value
    // to rebind from — skip it so an authored `inherit` isn't hijacked.
    if (t.fallback === "inherit") continue;
    const key = t.kind === "color" ? t.fallback.toLowerCase() : t.fallback;
    if (!out.has(key)) out.set(key, t.key);
  }
  return out;
}

const EXACT_RAW_TO_TOKEN = buildExactRawToTokenMap();

/**
 * If `rawValue` EXACTLY matches a theme token's value, return the `token:<key>`
 * sentinel that binds to it; otherwise return null (leave the raw value). The
 * `kind` argument scopes the match to a category so a `"0.5rem"` border-radius
 * can't accidentally rebind to a spacing token with the same fallback.
 *
 * Used by the inspector's "Follow theme" one-click action to make an existing
 * raw design track the theme — conservatively, only where the author's value is
 * already the token's value.
 */
export function rebindRawToTokenRef(
  rawValue: string | undefined | null,
  kind: StyleBindableTokenKind,
): string | null {
  if (typeof rawValue !== "string" || rawValue.length === 0) return null;
  if (isStyleTokenRef(rawValue)) return null; // already bound.
  const raw: string = rawValue;
  const lookup = kind === "color" ? raw.toLowerCase() : raw;
  const matchedKey = EXACT_RAW_TO_TOKEN.get(lookup);
  if (!matchedKey) return null;
  const token = TOKEN_BY_KEY.get(matchedKey);
  if (!token || token.kind !== kind) return null;
  return styleTokenRef(matchedKey);
}

/**
 * RENDER-TIME resolver. Maps a `token:<key>` sentinel to its CSS variable with
 * the token default as the fallback; returns any other value (raw hex / rgb /
 * keyword / literal var() / undefined) UNCHANGED. This is the one function the
 * renderer calls at every color / font-family emit site.
 *
 * Back-compat guarantee: a value that is not a recognised sentinel is returned
 * by identity, so existing trees + the flagship (raw values only) are
 * byte-identical. An UNKNOWN `token:` key (e.g. a token retired since the tree
 * was authored) degrades to `undefined` rather than emitting an invalid
 * declaration — the prop simply falls through to its inherited value.
 */
export function resolveStyleTokenRef<T extends string | number | undefined>(
  value: T,
): T | string | undefined {
  if (typeof value !== "string") return value;
  if (!value.startsWith(STYLE_TOKEN_REF_PREFIX)) return value;
  const token = parseStyleTokenRef(value);
  if (!token) return undefined;
  return `var(${token.cssVar}, ${token.fallback})`;
}
