/**
 * DESIGN PALETTE EDITS (Template Factory): colours belong to a design's
 * palettes (its Looks), so a colour edited in the design editor is stored per
 * palette on the design version itself:
 *
 *   DesignPayload.palettes = { [paletteKey]: { "color.*": value } }
 *
 * Values are ABSOLUTE overrides on top of the code palette
 * (`galleryPaletteLookTokens`), carried cumulatively by every version like
 * `tokenDefaults`. A version without `palettes` ships the code palettes.
 *
 * The palette key is the gallery palette key ("stone"); a site's
 * `theme_look_slug` may be the key itself or a prefixed Look row slug
 * ("folio-stone", "maison-pink"), see `paletteKeyForLook`. Pure, client-safe.
 */
import { galleryPaletteLookTokens, getGalleryDesign } from "./gallery-meta";
import { isPaletteTokenKey, isValidPaletteValue } from "./look-layer";
import type { DesignPayload } from "./types";

export { isPaletteTokenKey, isValidPaletteValue };

export type DesignPalettes = Record<string, Record<string, string>>;

/** Gallery palette key for a look slug / palette key of `design`; null when unknown. */
export function paletteKeyForLook(design: string, look: string | null | undefined): string | null {
  const d = getGalleryDesign(design);
  const raw = look?.trim();
  if (!d || !raw) return null;
  const known = (k: string) => d.palettes.some((p) => p.key === k);
  if (known(raw)) return raw;
  for (const prefix of [`${d.slug}-`, "maison-"]) {
    if (raw.startsWith(prefix) && known(raw.slice(prefix.length))) return raw.slice(prefix.length);
  }
  return null;
}

/** The palette the editor is on: `look` when known, else the design's first palette. */
export function editorPaletteKey(design: string, look: string | null | undefined): string | null {
  return paletteKeyForLook(design, look) ?? getGalleryDesign(design)?.palettes[0]?.key ?? null;
}

export function paletteDisplayName(design: string, key: string): { en: string; es: string } {
  const p = getGalleryDesign(design)?.palettes.find((x) => x.key === key);
  return { en: p?.name.en ?? key, es: p?.name.es ?? key };
}

/** Effective look tokens of one palette at a design version (code palette + version overrides). */
export function designPaletteTokens(
  design: string,
  paletteKey: string,
  palettes: DesignPalettes | undefined,
): Record<string, string> | null {
  const code = galleryPaletteLookTokens(design, paletteKey);
  if (!code) return null;
  return { ...code, ...(palettes?.[paletteKey] ?? {}) };
}

/** Look tokens with the version's palette overrides for `paletteKey` on top. */
export function withPaletteOverrides(
  look: Readonly<Record<string, string>>,
  payload: Pick<DesignPayload, "palettes"> | null | undefined,
  paletteKey: string | null,
): Record<string, string> {
  const over = paletteKey ? payload?.palettes?.[paletteKey] : undefined;
  return over ? { ...look, ...over } : { ...look };
}

export interface PaletteChange {
  palette: string;
  token: string;
  from: string | null;
  to: string | null;
}

/**
 * Per (palette, token) where the effective colour differs between versions.
 * An override removed reverts to the code palette value.
 */
export function diffDesignPalettes(
  design: string,
  from: DesignPalettes | undefined,
  to: DesignPalettes | undefined,
): PaletteChange[] {
  const out: PaletteChange[] = [];
  const keys = [...new Set([...Object.keys(from ?? {}), ...Object.keys(to ?? {})])].sort();
  for (const palette of keys) {
    const a = from?.[palette] ?? {};
    const b = to?.[palette] ?? {};
    const code = galleryPaletteLookTokens(design, palette) ?? {};
    for (const token of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
      const va = a[token] ?? code[token] ?? null;
      const vb = b[token] ?? code[token] ?? null;
      if (va !== vb) out.push({ palette, token, from: va, to: vb });
    }
  }
  return out;
}

export { paletteItemKey, parsePaletteItemKey } from "../theme-releases/palette-keys";

const COLOR_LABELS: Record<string, { en: string; es: string }> = {
  "color.background": { en: "page background", es: "fondo de página" },
  "color.surface-raised": { en: "section background", es: "fondo de sección" },
  "color.line": { en: "lines", es: "líneas" },
  "color.ink": { en: "text", es: "texto" },
  "color.muted": { en: "soft text", es: "texto suave" },
  "color.primary": { en: "buttons", es: "botones" },
  "color.primary-on": { en: "button text", es: "texto de botones" },
  "color.accent": { en: "accent", es: "acento" },
  "color.blush": { en: "soft accent", es: "acento suave" },
};

export function paletteColorLabel(token: string, locale: "en" | "es"): string {
  return COLOR_LABELS[token]?.[locale] ?? token.replace(/^color\./, "").replace(/[-_]/g, " ");
}

export { canonicalPalettes } from "./palettes-canonical";
