/**
 * One-colour custom accent (release 2.5, PL-2): a talent picks ONE colour and
 * the rest of the palette follows, so every design can offer the same simple
 * control ("the same control works for every theme").
 *
 *   accent      the colour she picked, used as-is for buttons and fills
 *   on          the button label colour: white when it reads at 3.2:1 on the
 *               accent, otherwise a near-black
 *   tint        the soft fill behind chips and initials (88% white)
 *   page        the faintly tinted page ground (97.5% white)
 *   line        hairlines (84% white)
 *   text        the accent made safe as TEXT on white (4.5:1), darkened only
 *               when it has to be
 *
 * Surfaces, ink and muted stay with the base palette. On a dark base palette
 * the page ground and hairlines are left alone (mixing with white would turn a
 * dark site light) and the tint is mixed into the dark ground instead.
 * Pure; the theme drawer and the tests call the same function.
 */
import { contrastRatio, mixHex, readableAccentText, relativeLuminance } from "@/lib/site-admin/tokens/contrast-pair";

const WHITE = "#ffffff";
/** The mockup's near-black for text on a pale accent. */
const ON_PALE = "#161214";
/** White stays on the accent while it reads at this ratio (large text / buttons). */
const ON_MIN_CONTRAST = 3.2;

export interface CustomAccentPalette {
  accent: string;
  on: string;
  tint: string;
  page: string;
  line: string;
  text: string;
  /** True when `text` had to be darkened from the accent to read as text. */
  adjusted: boolean;
  /** Contrast of `text` on white. */
  textContrast: number;
}

/** `#rgb` / `#rrggbb` to lowercase `#rrggbb`, or null. */
export function normalizeAccentHex(raw: string): string | null {
  const t = raw.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(t)) return `#${t.split("").map((c) => c + c).join("").toLowerCase()}`;
  if (/^[0-9a-fA-F]{6}$/.test(t)) return `#${t.toLowerCase()}`;
  return null;
}

export function deriveCustomAccent(raw: string): CustomAccentPalette | null {
  const accent = normalizeAccentHex(raw);
  if (!accent) return null;
  const tint = mixHex(accent, WHITE, 0.88);
  const page = mixHex(accent, WHITE, 0.975);
  const line = mixHex(accent, WHITE, 0.84);
  const text = readableAccentText(accent, WHITE);
  if (!tint || !page || !line || !text) return null;
  return {
    accent,
    on: (contrastRatio(accent, WHITE) ?? 0) >= ON_MIN_CONTRAST ? WHITE : ON_PALE,
    tint,
    page,
    line,
    text,
    adjusted: text !== accent,
    textContrast: Math.round((contrastRatio(text, WHITE) ?? 0) * 10) / 10,
  };
}

/**
 * The registry token values one custom accent writes. `base` is the current
 * draft (used to tell a light palette from a dark one). `color.primary-on` and
 * `color.accent-text` are derived at render, so they are not written.
 */
export function customAccentTokenPatch(raw: string, base: Readonly<Record<string, string>> = {}): Record<string, string> | null {
  const p = deriveCustomAccent(raw);
  if (!p) return null;
  const ground = base["color.background"] || WHITE;
  const dark = (relativeLuminance(ground) ?? 1) < 0.4;
  if (dark) {
    return {
      "color.primary": p.accent,
      "color.accent": p.accent,
      "color.blush": mixHex(ground, p.accent, 0.25) ?? p.tint,
    };
  }
  return {
    "color.primary": p.accent,
    "color.accent": p.accent,
    "color.blush": p.tint,
    "color.background": p.page,
    "color.line": p.line,
  };
}

/** The note under the control, in the editor's language (no em dashes). */
export function customAccentNote(p: CustomAccentPalette, locale: "en" | "es"): string {
  const ratio = p.textContrast.toFixed(1);
  if (locale === "es") {
    return p.adjusted
      ? `Tu color se usa en los botones. Un tono más oscuro (${p.text}) se usa en los textos sobre blanco para que se lean bien (${ratio}:1).`
      : `Se lee bien como texto sobre blanco (${ratio}:1). Texto del botón: ${p.on === WHITE ? "blanco" : "oscuro"}.`;
  }
  return p.adjusted
    ? `Your color is used for buttons. A darker ${p.text} is used for text on white so it stays readable (${ratio}:1).`
    : `Readable as text on white (${ratio}:1). Button text: ${p.on === WHITE ? "white" : "dark"}.`;
}
