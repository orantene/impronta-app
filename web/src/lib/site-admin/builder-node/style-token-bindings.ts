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
  kind: "color" | "font-family";
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

/** Every bindable token (colors + font families). */
export const STYLE_BINDABLE_TOKENS: ReadonlyArray<StyleBindableToken> = [
  ...COLOR_BINDINGS,
  ...FONT_FAMILY_BINDINGS,
];

/** Bindable color tokens — for the inspector color pickers. */
export const STYLE_BINDABLE_COLOR_TOKENS: ReadonlyArray<StyleBindableToken> =
  COLOR_BINDINGS;

/** Bindable font-family tokens — for the inspector font-family control. */
export const STYLE_BINDABLE_FONT_FAMILY_TOKENS: ReadonlyArray<StyleBindableToken> =
  FONT_FAMILY_BINDINGS;

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

/** True when `key` names a token that can be bound (registry color / font). */
export function isBindableTokenKey(key: string): boolean {
  return TOKEN_BY_KEY.has(key);
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
