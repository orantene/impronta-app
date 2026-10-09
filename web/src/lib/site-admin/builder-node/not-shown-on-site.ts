/**
 * TUL-124 — shared copy for the builder canvas badge when a block is visible
 * while authoring but the live talent site drops it (empty bound reviews /
 * services / portfolio bands, incomplete before/after, empty social embeds).
 *
 * Pure strings only so unit tests and the React badge share one source.
 * Never invent reviews; never show this badge on the published path.
 */

export const NOT_SHOWN_ON_SITE_EN = "Not shown on your site";
export const NOT_SHOWN_ON_SITE_ES = "No se muestra en tu sitio";

export function notShownOnSiteLabel(locale?: string | null): string {
  return (locale ?? "").toLowerCase().startsWith("es")
    ? NOT_SHOWN_ON_SITE_ES
    : NOT_SHOWN_ON_SITE_EN;
}
