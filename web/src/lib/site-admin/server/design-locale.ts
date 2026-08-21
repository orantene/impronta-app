/**
 * ONE DESIGN PER PAGE — which `cms_pages` row supplies the design, and how the
 * visitor's language is layered on top of it.
 *
 * THE PRODUCT MODEL
 * ─────────────────
 * A workspace has a PRIMARY language (`agency_business_identity.default_locale`).
 * The page authored in that language IS the design: block order, layout,
 * styling, images, and every non-text choice such as which talent a roster block
 * shows. Every other language is TEXT ONLY — per element, in
 * `node.i18n[locale][prop]`, edited through the inspector's language tabs.
 *
 * So a visitor on `/es` gets the PRIMARY row's tree, rendered with the Spanish
 * overlay resolved on top. Editing the English page moves a block for every
 * language at once, which is the whole point: the design cannot fork.
 *
 * WHAT THIS REPLACES
 * ──────────────────
 * The freeform migration rendered `(tenant, locale, slug)` strictly, so `/es`
 * was a wholly separate page. Edits to the primary page were invisible on the
 * secondary one — different block order, different talent, stale copy.
 *
 * SECONDARY ROWS ARE A FALLBACK, NOT A TARGET. A tenant may still have a page
 * that exists ONLY in a secondary language (seeded before this model, or
 * authored directly). `designLocaleFallbacks` gives the caller the ordered list
 * of locales to try, so such a page keeps rendering instead of 404-ing.
 */

import type { TenantLocaleSettings } from "./locale-resolver";
import type { BuilderNodeContentLocaleOptions } from "@/lib/site-admin/builder-node/render";

export interface DesignLocaleResolution {
  /** The locale whose row supplies the DESIGN (tree, order, styling). */
  designLocale: string;
  /** The locale the visitor reads — what overlays resolve to. */
  contentLocale: string;
  /** True when the two differ, i.e. this render is design + overlay. */
  usesOverlay: boolean;
  /**
   * Ordered locales to look the page up under. The design locale first; the
   * requested locale second when it differs, so a page that exists ONLY in a
   * secondary language still renders (its own tree, no overlay).
   */
  lookupOrder: readonly string[];
  /** Render options for the renderer's per-element translation resolution. */
  renderContentLocale: BuilderNodeContentLocaleOptions;
}

/**
 * Decide the design row and the overlay context for a request.
 *
 * `editorPreview` marks the untranslated cue (40% opacity + dotted outline) that
 * only ever renders on the editor canvas — never pass it from a public render.
 */
export function resolveDesignLocale(
  settings: TenantLocaleSettings,
  requestedLocale: string,
  opts?: { editorPreview?: boolean },
): DesignLocaleResolution {
  const designLocale = settings.defaultLocale;
  const usesOverlay = requestedLocale !== designLocale;
  const lookupOrder = usesOverlay ? [designLocale, requestedLocale] : [designLocale];

  return {
    designLocale,
    contentLocale: requestedLocale,
    usesOverlay,
    lookupOrder,
    renderContentLocale: {
      locale: requestedLocale,
      // The base prop on every node is written in the design row's language, so
      // THAT is the locale the base value stands for — not necessarily the
      // tenant default, when we fell back to a secondary-only page.
      defaultLocale: designLocale,
      chain: settings.fallbackChain(requestedLocale as never),
      ...(opts?.editorPreview ? { editorPreview: true as const } : {}),
    },
  };
}

/**
 * The overlay context for a page whose design row turned out to be in
 * `actualLocale` rather than the tenant default (the secondary-only fallback).
 * The base props are that row's language, so the resolver must treat it as the
 * base — otherwise a Spanish-only page would resolve its own text as a
 * "fallback" and, in the editor, paint every element as untranslated.
 */
export function contentLocaleForDesignRow(
  settings: TenantLocaleSettings,
  requestedLocale: string,
  actualDesignLocale: string,
  opts?: { editorPreview?: boolean },
): BuilderNodeContentLocaleOptions {
  return {
    locale: requestedLocale,
    defaultLocale: actualDesignLocale,
    chain: settings.fallbackChain(requestedLocale as never),
    ...(opts?.editorPreview ? { editorPreview: true as const } : {}),
  };
}
