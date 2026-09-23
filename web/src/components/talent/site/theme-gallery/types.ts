/**
 * Talent theme gallery UI (Phase 0.C) — client-safe shapes only.
 *
 * `GalleryCatalogEntry` is what the manager's bootstrap action hands the
 * `ThemeGallery` component: a `CatalogEntry` (no payload, see
 * `theme-catalog/types.ts`) plus the tier lock, computed server-side from the
 * caller's plan (`talentPlanAllowsThemeTier` in `loadTalentThemeCatalog`). The gallery never re-derives the
 * lock from a tier string itself — it only ever renders what the server sent.
 */
import type { TalentThemeCatalogEntry } from "@/lib/talent-site/theme-catalog/types";

export type ThemeGalleryMode = "wizard" | "manager" | "look-only";
export type ThemeGalleryStep = "design" | "look";

/** Exactly what `loadTalentThemeCatalog` returns: `locked` is true when the
 * caller's plan is below `requiredTier` (not selectable). */
export type GalleryCatalogEntry = TalentThemeCatalogEntry;

export interface ThemeGalleryApplyInput {
  designSlug?: string;
  lookSlug?: string;
}

export interface ThemeGalleryApplyResult {
  ok: boolean;
  error?: string;
  /** The talent declined the confirm prompt: no error is shown. */
  cancelled?: boolean;
}

/** The tokens a Look preview can restyle the iframe with instantly, derived
 * from `ThemePreview.swatch` + `fontPreview` (client-safe card art — never the
 * full Look payload, which stays server-only). Registry-keyed so the preview
 * frame's CSS-var projection (`designTokensToCssVars`) applies them directly. */
export function swatchToPreviewTokens(entry: GalleryCatalogEntry): Record<string, string> {
  const { swatch, fontPreview } = entry.preview ?? {};
  const tokens: Record<string, string> = {};
  if (swatch) {
    if (swatch.primary) tokens["color.primary"] = swatch.primary;
    if (swatch.secondary) tokens["color.secondary"] = swatch.secondary;
    if (swatch.accent) tokens["color.accent"] = swatch.accent;
    if (swatch.background) tokens["color.background"] = swatch.background;
    if (swatch.ink) tokens["color.ink"] = swatch.ink;
  }
  if (fontPreview) {
    if (fontPreview.heading) tokens["typography.heading-font-family"] = fontPreview.heading;
    if (fontPreview.body) tokens["typography.body-font-family"] = fontPreview.body;
  }
  return tokens;
}
