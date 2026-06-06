/**
 * W6-T4(a) — real thumbnail sourcing for the first-run starter picker.
 *
 * The picker used to render gray `Wire*` SVG skeletons (section kits) and
 * tinted-gradient placeholder bars (full-page designs). Placeholder boxes read
 * "unfinished" — the documented #1 acceptance blocker — so the selection step
 * looked cheaper than the polished result it produces.
 *
 * Honest fix WITHOUT fabricating screenshots: every full-page design and most
 * section kits now show a REAL editorial photograph that already ships in
 * `web/public/marketing/photos` (the same library the designs themselves pull
 * from). The cards look finished, and nothing here is a fake mock.
 *
 * Asset-pipeline ready: when actual rendered screenshots of each design exist,
 * drop a file at `/builder-thumbnails/<id>.{webp,png}` and add the id to
 * `RENDERED_DESIGN_THUMBNAILS` below — the component prefers a rendered shot
 * over the representative photo automatically, no other code change. Until then
 * the representative photo is the honest stand-in (NOT a placeholder box).
 *
 * Paths are root-relative `/…` so they resolve on every tenant host (path
 * prefix, subdomain, custom domain) exactly like the design photos, and they
 * are plain static files (no image-optimizer / CSP surface) since they're used
 * as CSS `background-image`.
 */

import type { PageDesignArchetype } from "@/lib/site-admin/builder-node/page-designs/types";

/**
 * Per-archetype representative photo. Each is a genuine photograph from the
 * shipped marketing library, chosen to read as the kind of site that archetype
 * produces. This is the honest stand-in until per-design rendered screenshots
 * land.
 */
const ARCHETYPE_THUMBNAIL: Record<PageDesignArchetype, string> = {
  editorial: "/marketing/photos/mk-models-runway.jpg",
  agency: "/marketing/photos/agency-workspace-builder.jpg",
  saas: "/marketing/photos/mk-hero-business.jpg",
  store: "/marketing/photos/talent-services-hero.jpg",
  festival: "/marketing/photos/mk-models-party.jpg",
  studio: "/marketing/photos/hub-agency-discovery.jpg",
  noir: "/marketing/photos/mk-hero-perform.jpg",
  restaurant: "/marketing/photos/mk-hosts-restaurant.jpg",
  conference: "/marketing/photos/mk-audience-business.jpg",
  coach: "/marketing/photos/mk-hero-service.jpg",
};

/**
 * Per-design overrides — wins over the archetype default so two designs that
 * share an archetype (e.g. the two "agency" designs) don't show the same photo.
 */
const DESIGN_ID_THUMBNAIL: Record<string, string> = {
  impronta: "/marketing/photos/mk-models-runway.jpg",
  agency: "/marketing/photos/agency-workspace-builder.jpg",
  editorial: "/marketing/photos/independent-singer-booking.jpg",
  studio: "/marketing/photos/service-pros-lifestyle.jpg",
  noir: "/marketing/photos/mk-hero-perform.jpg",
};

/**
 * Ids for which a real RENDERED screenshot exists at
 * `/builder-thumbnails/<id>.webp`. Empty today — populate when the screenshot
 * pipeline runs. Listing an id here makes the component prefer the rendered
 * shot over the representative photo.
 */
const RENDERED_DESIGN_THUMBNAILS: ReadonlySet<string> = new Set<string>();

/**
 * Section-kit category → representative photo. Kits are layout recipes, so the
 * photo signals the kind of page the kit is best for.
 */
const KIT_CATEGORY_THUMBNAIL: Record<string, string> = {
  featured: "/marketing/photos/mk-hero-perform.jpg",
  agency: "/marketing/photos/agency-workspace-builder.jpg",
  service: "/marketing/photos/service-pros-lifestyle.jpg",
  portfolio: "/marketing/photos/independent-singer-booking.jpg",
  food: "/marketing/photos/mk-hosts-restaurant.jpg",
};

export interface DesignThumbnailSource {
  /** Root-relative image URL to use as a CSS background, or null to fall back. */
  src: string | null;
  /** True when `src` is a real rendered screenshot (vs. a representative photo). */
  rendered: boolean;
}

/** Resolve the best available thumbnail for a full-page design. */
export function pageDesignThumbnail(
  id: string,
  archetype: PageDesignArchetype,
): DesignThumbnailSource {
  if (RENDERED_DESIGN_THUMBNAILS.has(id)) {
    return { src: `/builder-thumbnails/${id}.webp`, rendered: true };
  }
  const src = DESIGN_ID_THUMBNAIL[id] ?? ARCHETYPE_THUMBNAIL[archetype] ?? null;
  return { src, rendered: false };
}

/** Resolve the best available thumbnail for a section kit by its category. */
export function kitThumbnail(category: string): DesignThumbnailSource {
  return { src: KIT_CATEGORY_THUMBNAIL[category] ?? null, rendered: false };
}
