/**
 * Pure token helpers for the theme_template surface (talent DESIGN editor).
 * Canvas tokens = look tokens, with the design's tokenDefaults on top
 * (never designTokenDefaults(slug), which is the published design).
 */
import { resolveEffectiveSiteTokens } from "@/lib/talent-site/site-theme-tokens";
import {
  galleryDefaultLookTokens,
  galleryPaletteLookTokens,
} from "@/lib/talent-site/theme-catalog/gallery-meta";
import { editorPaletteKey, withPaletteOverrides } from "@/lib/talent-site/theme-catalog/design-palettes";
import type { ThemeDraft } from "./types";

type Tokens = Record<string, string>;

/** Preview look tokens for a draft: chosen palette (or the design default) + previewTokens. */
export function themeTemplatePreviewLook(
  draft: Pick<ThemeDraft, "design" | "preview"> & { payload?: Pick<ThemeDraft["payload"], "palettes"> },
  lookSlug?: string | null,
): Tokens {
  const key = lookSlug ?? draft.preview.look ?? null;
  return { ...themeTemplatePaletteTokens(draft.design, key, draft.payload), ...(draft.preview.previewTokens ?? {}) };
}

/**
 * The palette the editor shows for `look` (a gallery palette key; else the
 * design's first palette) with the draft's palette colour edits on top.
 */
export function themeTemplatePaletteTokens(
  design: string,
  look: string | null | undefined,
  payload: Pick<ThemeDraft["payload"], "palettes"> | null | undefined,
): Tokens {
  // `look` may be a prefixed Look slug ("folio-stone"): resolve it to the
  // gallery palette key so display and save use the SAME palette.
  const key = editorPaletteKey(design, look);
  const base = (key ? galleryPaletteLookTokens(design, key) : null) ?? galleryDefaultLookTokens(design) ?? {};
  return withPaletteOverrides(base, payload, key);
}

/**
 * Canvas tokens for the theme_template surface (S5 uses this).
 * resolveEffectiveSiteTokens({}, previewLook, platformDefault, draft.tokenDefaults).
 */
export function themeTemplateCanvasTokens(
  draft: Pick<ThemeDraft, "design" | "payload" | "preview">,
  look?: Tokens | null,
  platformDefault: Tokens = {},
): Tokens {
  const previewLook = look ?? themeTemplatePreviewLook(draft);
  return resolveEffectiveSiteTokens(
    {},
    previewLook,
    platformDefault,
    (draft.payload.tokenDefaults ?? {}) as Tokens,
  );
}

/** The drawer's working copy: look tokens with the draft's tokenDefaults on top. */
export function themeTemplateDrawerTokens(
  draft: Pick<ThemeDraft, "design" | "payload" | "preview">,
  look?: Tokens | null,
  lookSlug?: string | null,
): Tokens {
  return {
    ...(look ?? themeTemplatePreviewLook(draft, lookSlug)),
    ...((draft.payload.tokenDefaults ?? {}) as Tokens),
  };
}

export const THEME_TEMPLATE_UNSUPPORTED = {
  en: "Not available when editing a design. Edit the site-wide tokens instead.",
  es: "No disponible al editar un diseño. Edita los tokens globales del sitio.",
} as const;
