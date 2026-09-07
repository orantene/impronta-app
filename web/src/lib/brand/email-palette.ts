/**
 * Email brand palette — the colour half of `EmailBrand`.
 *
 * Every transactional email rendered a button hardcoded to `#c9a227`. That
 * hex is not a platform colour: `globals.css` names it `--impronta-gold`, and
 * `agency_branding.primary_color` for the Impronta tenant is the same value.
 * So Tulala's own support mail was wearing one tenant's brand colour, that
 * tenant's mail was wearing it too, and the two were indistinguishable in the
 * inbox apart from the wordmark text. A third tenant (El Paisa, `#d21a28`)
 * got the gold as well — a colour from a business they have no relation to.
 *
 * This module is deliberately pure and free of `server-only` so the React
 * Email components under `web/emails` and the server-side brand resolver can
 * share one definition instead of drifting apart.
 */

/**
 * Tulala's own email colours, taken from the canonical `--tl-*` marketing
 * tokens in `globals.css` (`--tl-forest` / `--tl-forest-on`). Emails are the
 * one platform surface those tokens never reached, because a stylesheet
 * custom property cannot cross into an inlined-CSS email.
 */
export const TULALA_EMAIL_ACCENT = "#1e3a2d";
export const TULALA_EMAIL_ACCENT_ON = "#f4efe6";

/** `--tl-ink`: the darkest readable foreground we put on a light accent. */
const INK = "#161a16";
const WHITE = "#ffffff";

/**
 * Accepts `#rgb` / `#rrggbb` only.
 *
 * Operators type these into a settings field, so the value reaching here is
 * arbitrary text. Anything else — a `var(...)`, a CSS colour name, an empty
 * string, a half-typed hex — resolves to `null` so a malformed value can never
 * reach a `style` attribute and blank out a button's background.
 */
export function normalizeBrandHex(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v) ? v.toLowerCase() : null;
}

/** Expand `#abc` to `#aabbcc`; pass `#aabbcc` through. Input must be valid. */
function expand(hex: string): string {
  if (hex.length !== 4) return hex;
  const [, r, g, b] = hex;
  return `#${r}${r}${g}${g}${b}${b}`;
}

/** WCAG relative luminance of a validated hex colour. */
function luminance(hex: string): number {
  const h = expand(hex);
  const channel = (offset: number): number => {
    const c = parseInt(h.slice(offset, offset + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * The readable text colour to put ON `background`.
 *
 * A tenant is free to pick a pale brand colour — `#ffc107` is already in the
 * data as one workspace's accent. White label text on it is unreadable, and a
 * CTA nobody can read is a broken email, not a styling nit. Picks whichever of
 * white / near-black actually contrasts better, rather than assuming white.
 *
 * Returns white for an invalid input: callers pair that with a dark default
 * accent, so the safe pairing survives a bad value.
 */
export function readableOn(background: string): string {
  const hex = normalizeBrandHex(background);
  if (!hex) return WHITE;
  return contrast(WHITE, hex) >= contrast(INK, hex) ? WHITE : INK;
}

/**
 * An email logo has to be an absolute `https:` URL or it is not a logo.
 *
 * `theme_json.logo_url` is operator-set free text. A relative path renders as
 * a broken image in every inbox (there is no page origin to resolve against),
 * and a non-https scheme is either blocked outright or downgrades the mail in
 * spam scoring. Anything that is not a parseable https URL resolves to null,
 * and the header keeps the text wordmark — which is a correct brand, not a
 * broken one.
 */
export function httpsLogoUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  if (!v) return null;
  try {
    return new URL(v).protocol === "https:" ? v : null;
  } catch {
    return null;
  }
}
