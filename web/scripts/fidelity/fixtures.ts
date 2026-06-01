import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Real-photo fixtures for the fidelity harness.
 *
 * Honest Asset scoring needs REAL photography, not initials-in-a-box, abstract
 * SVG shapes, or UI wireframe mockups (those read "unfinished" and are the
 * user's #1 acceptance blocker). Rather than duplicate binaries, this resolver
 * points at editorial photos that already ship in `web/public/marketing/photos`.
 *
 * IMPORTANT — every alias below is a genuine photograph. The `public/talent-
 * templates/*.webp` files are deliberately NOT used here: they are template-
 * preview wireframes (grey placeholder boxes + dummy headlines), i.e. exactly
 * the placeholder imagery the Asset axis penalises. Using them would make the
 * "real photography" claim false.
 *
 * Why a root-relative path, not `file://`: the renderer validates every image
 * `src` via `isSafeBuilderImageSrc`, which accepts ONLY `http(s)` or root-
 * relative `/…` and drops `file://` AND `data:` srcs (a `data:` SVG silently
 * renders NOTHING). So the harness serves `web/public` over a localhost static
 * server during capture (see server.ts) and designs reference photos as
 * `/marketing/…` — which the renderer accepts and the server resolves to
 * `web/public/marketing/…`. Captures stay offline, deterministic, and
 * security-faithful (the renderer guard is never loosened).
 */

// Resolved from cwd (always `web/` — every harness entry point runs there).
// Avoids `import.meta`, which breaks if this module is pulled into the Playwright
// e2e import graph (CJS transpile) by a fixture-using design.
const WEB_ROOT = resolve(process.cwd());

/**
 * Curated REAL photos that already ship in the repo. Each is a high-resolution
 * editorial photograph; the comment notes its native framing so designs can
 * pick honest `object-position` crops for repeater variety.
 */
export const FIDELITY_PHOTOS = {
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

export type FidelityPhotoKey = keyof typeof FIDELITY_PHOTOS;

/**
 * Resolve a fixture alias to a renderer-safe, root-relative `src` (e.g.
 * `/marketing/photos/talent-services-hero.jpg`). The fidelity static server maps
 * it back to `web/public`. Throws if the underlying file is missing so a
 * renamed/removed asset fails the capture loudly instead of painting a broken
 * image and quietly tanking the Asset score.
 */
export function fidelityPhotoSrc(key: FidelityPhotoKey): string {
  const rootRelative = FIDELITY_PHOTOS[key];
  const absolute = resolve(WEB_ROOT, `public${rootRelative}`);
  if (!existsSync(absolute)) {
    throw new Error(
      `fidelity fixtures: photo "${key}" -> public${rootRelative} not found at ${absolute}. ` +
        `Update FIDELITY_PHOTOS in scripts/fidelity/fixtures.ts.`,
    );
  }
  return rootRelative;
}
