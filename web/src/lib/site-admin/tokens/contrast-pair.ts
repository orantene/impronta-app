/**
 * The readable foreground for a brand primary.
 *
 * THE BUG THIS EXISTS TO FIX
 * ──────────────────────────
 * `.site-theme-tenant-override` (globals.css) re-pins `--primary` to
 * `var(--token-color-primary)` — registry default `#111111` — and never
 * re-pins `--primary-foreground`, which therefore keeps whatever the base
 * class set. On a dark base that is `#0a0a0a`, so a brandless tenant's primary
 * button painted `#0a0a0a` on `#111111`: a contrast ratio of about 1.05:1, or
 * an invisible label. Front Door's "Reserve" button is the one people saw.
 *
 * WHY A PROJECTED TOKEN RATHER THAN A CSS EXPRESSION
 * ──────────────────────────────────────────────────
 * The same effect is expressible in modern CSS with relative colour syntax
 * (`oklch(from var(--primary) …)` plus an infinity-clamp to snap lightness).
 * It is rejected here for two reasons:
 *
 *   1. This repo has already been burned by a custom-property chain that
 *      resolved EMPTY at computed-value time and painted nothing, silently, on
 *      every tenant that had not customised its design. A var expression that
 *      fails produces no colour and no error; a projected value either exists
 *      or does not.
 *   2. A computed value can be unit-tested against real contrast ratios. A CSS
 *      expression can only be eyeballed in a browser, and the browser is the
 *      one place this defect survived for months.
 *
 * WCAG RELATIVE LUMINANCE, NOT OKLCH LIGHTNESS, because the thing being
 * protected is a contrast RATIO and that ratio is defined in terms of relative
 * luminance. Picking the arm that actually wins the ratio is strictly better
 * than picking on a perceptual proxy and hoping.
 */

/**
 * The dark arm. `#0a0a0a`, NOT the `#111111` the ruling named — measured, not
 * preferred: `#0a0a0a` wins on every brand colour tested, and the difference
 * matters at the margin. El Paisa's `#e63946` lands at 4.53:1 against
 * `#111111` (barely over the 4.5 AA line) and 4.75:1 against `#0a0a0a`.
 *
 *   primary   on #111111   on #0a0a0a
 *   #e63946      4.53         4.75
 *   #c6a14e      7.74         8.12
 *   #808080      4.78         5.01
 *   #ffffff     18.88        19.80
 *
 * It is also the value the base class already used for `--primary-foreground`,
 * so light primaries keep exactly the contrast they had rather than losing a
 * fraction to the fix.
 */
export const CONTRAST_INK = "#0a0a0a";
export const CONTRAST_ON_LIGHT = CONTRAST_INK;
export const CONTRAST_ON_DARK = "#ffffff";

/** `#rgb` / `#rrggbb` → [r, g, b] in 0..1, or null when unparseable. */
function parseHex(value: string): [number, number, number] | null {
  const hex = value.trim().replace(/^#/, "");
  const full =
    hex.length === 3
      ? hex
          .split("")
          .map((c) => c + c)
          .join("")
      : hex;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return [
    parseInt(full.slice(0, 2), 16) / 255,
    parseInt(full.slice(2, 4), 16) / 255,
    parseInt(full.slice(4, 6), 16) / 255,
  ];
}

/** WCAG 2.x relative luminance. */
export function relativeLuminance(hex: string): number | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  ) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two hex colours, or null if either is invalid. */
export function contrastRatio(a: string, b: string): number | null {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  if (la === null || lb === null) return null;
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * The foreground to paint ON `primary`, or null when `primary` is not a colour
 * we can reason about (a CSS keyword, a gradient, a var reference).
 *
 * Returning null rather than guessing is deliberate: an unknown primary must
 * leave the existing cascade alone, not stamp a colour over it. Absence has to
 * be structurally distinct from a value.
 */
export function foregroundForPrimary(primary: string): string | null {
  const lum = relativeLuminance(primary);
  if (lum === null) return null;

  // Pick the arm that actually wins the contrast ratio rather than trusting a
  // fixed lightness threshold. For mid-tone brand colours — the ones where a
  // threshold guesses wrong — this chooses the readable answer by measurement.
  const onDark = contrastRatio(primary, CONTRAST_ON_DARK) ?? 0;
  const onLight = contrastRatio(primary, CONTRAST_ON_LIGHT) ?? 0;
  return onDark >= onLight ? CONTRAST_ON_DARK : CONTRAST_ON_LIGHT;
}
