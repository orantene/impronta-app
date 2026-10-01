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
import type { ThemeDraft } from "./types";

type Tokens = Record<string, string>;

/** Preview look tokens for a draft: chosen palette (or the design default) + previewTokens. */
export function themeTemplatePreviewLook(
  draft: Pick<ThemeDraft, "design" | "preview">,
  lookSlug?: string | null,
): Tokens {
  const key = lookSlug ?? draft.preview.look ?? null;
  const base =
    (key ? galleryPaletteLookTokens(draft.design, key) : null) ??
    galleryDefaultLookTokens(draft.design) ??
    {};
  return { ...base, ...(draft.preview.previewTokens ?? {}) };
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
): Tokens {
  return {
    ...(look ?? themeTemplatePreviewLook(draft)),
    ...((draft.payload.tokenDefaults ?? {}) as Tokens),
  };
}

export const THEME_TEMPLATE_UNSUPPORTED = {
  en: "Not available when editing a design. Edit the site-wide tokens instead.",
  es: "No disponible al editar un diseño. Edita los tokens globales del sitio.",
} as const;
