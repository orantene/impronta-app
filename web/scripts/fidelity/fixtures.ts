import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Real-photo fixtures for the fidelity harness.
 *
 * Honest Asset scoring needs REAL photography, not initials-in-a-box or abstract
 * SVG shapes (those read "unfinished" and are the user's #1 acceptance blocker).
 * Rather than duplicate ~1.6 MB of binaries, this resolver points at photos that
 * already ship in `web/public/`.
 *
 * IMPORTANT — why a root-relative path, not `file://`: the renderer validates
 * every image `src` via `isSafeBuilderImageSrc`, which accepts ONLY `http(s)` or
 * root-relative `/…` and drops `file://` AND `data:` srcs. So the harness serves
 * `web/public` over a localhost static server during capture (see capture.ts) and
 * designs reference photos as `/marketing/…` — which the renderer accepts and the
 * server resolves to `web/public/marketing/…`. This keeps captures offline,
 * deterministic, and security-faithful (no loosening of the renderer guard).
 */

// Resolved from cwd (always `web/` — every harness entry point runs there).
// Avoids `import.meta`, which breaks if this module is pulled into the Playwright
// e2e import graph (CJS transpile) by a fixture-using design.
const WEB_ROOT = resolve(process.cwd());

/** Curated real photos that already ship in the repo. Keyed by a stable alias. */
export const FIDELITY_PHOTOS = {
  portraitWarm: "/talent-templates/editorial.webp",
  portraitStage: "/talent-templates/stage.webp",
  portraitCreator: "/talent-templates/creator.webp",
  lifestyleSinger: "/marketing/photos/independent-singer-booking.jpg",
  lifestyleServices: "/marketing/photos/talent-services-hero.jpg",
  lifestylePros: "/marketing/photos/service-pros-lifestyle.jpg",
  workspaceBuilder: "/marketing/photos/agency-workspace-builder.jpg",
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
