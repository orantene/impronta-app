/**
 * channel-performance-labels.ts — friendly names for the raw
 * `inquiry_source_channel` enum values the Channel-performance report groups by.
 *
 * The report groups leads by `inquiries.source_channel` (the
 * `inquiry_source_channel` enum). Rendering those raw tokens ("hub_site",
 * "discover_shortlist") in a report is unreadable, so this pure resolver maps
 * each enum value to a stable i18n key under `dashboard.channelPerformance.channels.*`.
 *
 * It is deliberately separate from `inquiry/inquiry-source-label.ts`: that
 * helper produces short inline provenance CHIPS ("via Discover", "from your
 * site") phrased per audience for a single inquiry thread. Here we want a plain
 * noun-phrase COLUMN LABEL for an aggregate report row, so a dedicated taxonomy
 * reads better than reusing the chip fragments.
 *
 * Pure + framework-free: the caller passes its own translator so this module
 * owns the taxonomy only (never a hardcoded English string, never a locale).
 */

/** Translator shape: a dot-path key in, a resolved string out. */
type Translate = (key: string) => string;

const KEY_ROOT = "dashboard.channelPerformance.channels";

/**
 * Map a raw `inquiry_source_channel` value to its i18n key. Covers every enum
 * member plus the loader's synthetic "unknown" bucket. Unmapped/novel values
 * fall through to `null` so the caller can prettify the raw token instead.
 */
const CHANNEL_KEY: Record<string, string> = {
  // Discover / cross-tenant catalog
  discover_single_talent: `${KEY_ROOT}.discover`,
  discover_shortlist: `${KEY_ROOT}.discoverShortlist`,
  saved_talent: `${KEY_ROOT}.savedTalent`,
  // Tulala shared network hub
  hub_site: `${KEY_ROOT}.hubSite`,
  // Agency-owned storefront surfaces
  agency_site: `${KEY_ROOT}.agencySite`,
  public_talent_profile: `${KEY_ROOT}.talentProfile`,
  directory_guest: `${KEY_ROOT}.directoryGuest`,
  directory_client: `${KEY_ROOT}.directoryClient`,
  // Client + booking lifecycle
  direct_client_dashboard: `${KEY_ROOT}.clientDashboard`,
  book_again: `${KEY_ROOT}.bookAgain`,
  instant_book: `${KEY_ROOT}.instantBook`,
  pitch: `${KEY_ROOT}.pitch`,
  // Manual / off-platform channels logged by staff
  phone: `${KEY_ROOT}.phone`,
  whatsapp: `${KEY_ROOT}.whatsapp`,
  email: `${KEY_ROOT}.email`,
  admin: `${KEY_ROOT}.manual`,
  admin_created: `${KEY_ROOT}.manual`,
  // Catch-alls
  other: `${KEY_ROOT}.other`,
  unknown: `${KEY_ROOT}.unknown`,
};

/**
 * Title-case a raw enum token as a last-resort fallback for a value we have no
 * mapping for (e.g. a newly-added enum member not yet in the map above), so the
 * report never renders a bare snake_case string.
 */
function prettifyToken(raw: string): string {
  const cleaned = raw.trim();
  if (!cleaned) return "";
  return cleaned
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Resolve a raw `inquiry_source_channel` value to a friendly, localized label
 * using the caller's translator. Falls back to a title-cased version of the raw
 * token for any value not in the map, so unknown/novel channels still render
 * legibly instead of as `snake_case`.
 */
export function channelPerformanceLabel(
  channel: string | null | undefined,
  t: Translate,
): string {
  const raw = (channel ?? "").toLowerCase().trim();
  if (!raw) return t(`${KEY_ROOT}.unknown`);
  const key = CHANNEL_KEY[raw];
  if (key) return t(key);
  // No mapping — prettify the raw token rather than showing snake_case.
  return prettifyToken(raw);
}
