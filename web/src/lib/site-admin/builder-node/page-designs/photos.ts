/**
 * Real-photo references for the productised page-design templates.
 *
 * Honest template imagery needs REAL photography, not initials-in-a-box or
 * placeholder boxes (those read "unfinished" — the user's #1 acceptance
 * blocker). Each alias below is a genuine editorial photograph that already
 * ships in `web/public/marketing/photos`, so a tenant who picks a template
 * gets a finished-looking page immediately and swaps in their own media later.
 *
 * Why root-relative paths (not `data:`/`file://`/remote): the builder renderer
 * validates every image `src` via `isSafeBuilderImageSrc`, which accepts ONLY
 * `http(s)` or root-relative `/…`. Next serves `/public` statically on every
 * tenant host (path-prefix, subdomain, or custom domain), so `/marketing/…`
 * resolves wherever the published page is viewed.
 *
 * Browser-safe by design: no `node:fs` here (unlike the harness fixtures), so
 * this module is importable from the app bundle. A node-side test
 * (`photos.test.ts`) asserts every path resolves to a real file so a
 * renamed/removed asset fails loudly in CI instead of painting a broken image.
 */

export const PAGE_DESIGN_PHOTOS = {
  /** ~2:1 wide loft scene — singer (L), chef (C), nail-artist (R). Hero / crop source. */
  studioScene: "/marketing/photos/talent-services-hero.jpg",
  /** ~4:5 portrait — vocalist at a mic. Portrait card / roster card. */
  vocalistPortrait: "/marketing/photos/independent-singer-booking.jpg",
  /** ~2:1 diptych — home-service pro (L) + makeup-artist & pilates coach (R). Crop source. */
  serviceProsScene: "/marketing/photos/service-pros-lifestyle.jpg",
  /** ~3:2 — three creatives reviewing prints + a laptop at a studio desk. */
  studioDesk: "/marketing/photos/agency-workspace-builder.jpg",
  /** ~4:3 portrait — director with a tablet against a moodboard wall. */
  directorPortrait: "/marketing/photos/hub-agency-discovery.jpg",
} as const;

export type PageDesignPhotoKey = keyof typeof PAGE_DESIGN_PHOTOS;

/**
 * Resolve a photo alias to a renderer-safe, root-relative `src`
 * (e.g. `/marketing/photos/talent-services-hero.jpg`).
 */
export function pageDesignPhoto(key: PageDesignPhotoKey): string {
  return PAGE_DESIGN_PHOTOS[key];
}
