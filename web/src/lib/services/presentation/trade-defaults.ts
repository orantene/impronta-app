import type { PresentationEntitlements, PresentationMode } from "./types";
import { PRESENTATION_MODES } from "./types";

/** Used when the trade is missing or unknown: today's behaviour (open the booking flow). */
export const DEFAULT_PRESENTATION_MODE: PresentationMode = "book_direct";

const BOOK_DIRECT = [
  // agenda trade keys and their talentTypeSlugs
  "beauty", "nail-tech", "lash-tech", "brow-artist", "makeup",
  "barber", "hairdresser", "hair",
  "massage", "masseuse", "bodywork",
  "trainer", "fitness", "coach",
  "clean", "cleaner", "cleaning", "housekeeping",
] as const;
const OWN_PAGE = [
  "photo", "photographer", "videographer",
  "dancer", "performer", "artist",
  "design", "designer", "brand", "graphic",
  "dj", "musician", "band", "singer",
] as const;
const EXPAND = ["restaurant", "menu", "catering", "food"] as const;
const QUICK_VIEW = [
  "tutor", "teacher", "instructor",
  "chef", "private-chef", "cook",
  "class", "classes", "workshop", "workshops",
] as const;

function build(): Record<string, PresentationMode> {
  const out: Record<string, PresentationMode> = {};
  for (const [slugs, mode] of [
    [BOOK_DIRECT, "book_direct"],
    [OWN_PAGE, "own_page"],
    [EXPAND, "expand"],
    [QUICK_VIEW, "quick_view"],
  ] as const) {
    for (const slug of slugs) out[slug] = mode;
  }
  return out;
}

/** Trade / talent-type slug -> default presentation. One data file, edit here. */
export const TRADE_PRESENTATION_DEFAULTS: Readonly<Record<string, PresentationMode>> = build();

export function tradeDefaultMode(slug: string | null | undefined): PresentationMode | null {
  const key = slug?.trim().toLowerCase();
  if (!key) return null;
  return Object.prototype.hasOwnProperty.call(TRADE_PRESENTATION_DEFAULTS, key)
    ? TRADE_PRESENTATION_DEFAULTS[key]!
    : null;
}

/**
 * Tenant plan -> allowed modes. Plans are those of normalizeTenantTaxonomyPlan.
 * Free has no standalone pages, so no own_page; every PAID workspace plan (website, studio, agency,
 * network) has them. `website` was missing, so Website-plan workspaces got no service pages (staging QA 2026-10-21).
 */
export function presentationEntitlementsForPlan(plan: string | null | undefined): PresentationEntitlements {
  const hasPages = plan === "website" || plan === "studio" || plan === "agency" || plan === "network";
  return {
    allowedModes: hasPages ? PRESENTATION_MODES : PRESENTATION_MODES.filter((m) => m !== "own_page"),
  };
}
