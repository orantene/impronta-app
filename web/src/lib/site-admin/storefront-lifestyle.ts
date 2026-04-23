/**
 * Per-tenant lifestyle imagery defaults for the agency storefront.
 *
 * When a tenant has not yet published a CMS hero with `slides[]`, the
 * fallback hero can still show a richer lifestyle reel if we know curated
 * imagery for that tenant. Entries here are keyed by tenant id and used
 * strictly as a visual default — the moment the tenant publishes a hero
 * section with their own slides, the M4 render path takes over and this
 * table is ignored.
 *
 * Using stable, hot-linkable Unsplash URLs keeps the dev footprint small;
 * production tenants upload their own imagery through the M5 media editor.
 */

/** Nova Crew — violet/cyan lifestyle palette. */
const NOVA_TENANT_ID = "33333333-3333-3333-3333-333333333333";
/** Midnight Muse Collective — afterhours nightlife/editorial palette. */
const MIDNIGHT_TENANT_ID = "44444444-4444-4444-4444-444444444444";
/** Luma Studio Roster — warm commercial/editorial palette. */
const LUMA_TENANT_ID = "55555555-5555-5555-5555-555555555555";

const LIFESTYLE_SLIDES_BY_TENANT: Record<string, readonly string[]> = {
  [NOVA_TENANT_ID]: [
    // Fashion editorial, model portraits, runway, candid lifestyle —
    // chosen for dramatic dark tones that pair with the violet palette.
    "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1920&q=70",
    "https://images.unsplash.com/photo-1525310072745-f49212b5ac6d?auto=format&fit=crop&w=1920&q=70",
    "https://images.unsplash.com/photo-1506152983158-b4a74a01c721?auto=format&fit=crop&w=1920&q=70",
    "https://images.unsplash.com/photo-1509631179647-0177331693ae?auto=format&fit=crop&w=1920&q=70",
  ],
  [MIDNIGHT_TENANT_ID]: [
    // Nightlife / afterhours / neon / silhouette — dark magenta-violet-gold
    // palette. Intentionally moody + contrasty to pair with the pink accent.
    "https://images.unsplash.com/photo-1571266028243-d220bc1408e0?auto=format&fit=crop&w=1920&q=70",
    "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1920&q=70",
    "https://images.unsplash.com/photo-1516981442399-a91139e20ff8?auto=format&fit=crop&w=1920&q=70",
    "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1920&q=70",
  ],
  [LUMA_TENANT_ID]: [
    // Warm commercial / editorial — sand, rose, terracotta, soft daylight.
    // Paired with the rose/sand palette for a quiet, cinematic tone.
    "https://images.unsplash.com/photo-1515378791036-0648a3ef77b2?auto=format&fit=crop&w=1920&q=70",
    "https://images.unsplash.com/photo-1469334031218-e382a71b716b?auto=format&fit=crop&w=1920&q=70",
    "https://images.unsplash.com/photo-1502716119720-b23a93e5fe1b?auto=format&fit=crop&w=1920&q=70",
    "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1920&q=70",
  ],
};

export function resolveStorefrontLifestyleSlides(
  tenantId: string,
): readonly string[] | null {
  const slides = LIFESTYLE_SLIDES_BY_TENANT[tenantId];
  return slides && slides.length > 0 ? slides : null;
}
