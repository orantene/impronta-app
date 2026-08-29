/**
 * The feature hub (`/features/{slug}` and `/es/funciones/{slug}`).
 *
 * Pillar E of the organic content plan, and the highest commercial intent of
 * the five: these pages answer "does this thing do X" for people already
 * shopping. The catalogue below is the single source the grid, the popups, the
 * landing pages, the nav, the sitemap and the cross-links all read, so a
 * feature can never say one thing in a popup and another on its page.
 *
 * Two rules the content must keep:
 *
 * 1. Claims match the shipped product. A feature marked `coming` says so on
 *    every surface and sells a waitlist, never a capability.
 * 2. Voice is second person, to the person doing the work, about the money
 *    they make. No em dashes anywhere (gated by `no-dash.static.test.ts`).
 */

/** Stable identity. Used by cross-links, so renaming one is a code change. */
export type FeatureKey =
  | "website-builder"
  | "talent-profiles"
  | "services-storefront"
  | "media-library"
  | "directory"
  | "qr-engine"
  | "reviews-and-trust"
  | "inquiry-engine"
  | "messenger"
  | "appointments"
  | "tables-and-seating"
  | "bookings-and-offers"
  | "payments"
  | "ticketing"
  | "discounts-and-campaigns"
  | "commission-engine"
  | "roster-and-team"
  | "client-management"
  | "analytics"
  | "automations"
  | "premium-support";

/** The five stages of the lifecycle. Order is the story, so it is fixed. */
export type FeatureGroup = "presence" | "found" | "booked" | "paid" | "run";

export const FEATURE_GROUP_ORDER: FeatureGroup[] = [
  "presence",
  "found",
  "booked",
  "paid",
  "run",
];

/**
 * A paragraph, as typed segments rather than a markup string.
 *
 * The renderer never parses markup (house rule), so a cross-link is data:
 * `["Every photo lives in your ", { f: "media-library", label: "media library" }, "."]`
 * The renderer turns the object into a real anchor that also opens that
 * feature's popup, which is why the label is authored per sentence instead of
 * being derived from the feature name.
 */
export type Para = Array<string | { f: FeatureKey; label: string }>;

export type FeatureFaq = { q: string; a: string };

export type FeatureSection = { heading: string; body: Para[] };

export type FeatureContent = {
  /** Plate name. Short enough to sit under an icon on a phone. */
  name: string;
  /** Page H1 and meta title. */
  title: string;
  /** Meta description and page subtitle. A real sentence, under ~155 chars. */
  subtitle: string;
  /** The italic line on the plate and at the top of the popup. One breath. */
  promise: string;
  /** Popup body. Two or three short paragraphs, a subset of the page. */
  popup: Para[];
  intro: Para[];
  sections: FeatureSection[];
  /** Scannable capability list. Not sentences. */
  highlights: string[];
  faq: FeatureFaq[];
};

export type Feature = {
  key: FeatureKey;
  /** 01 to 21 in lifecycle order. Rendered as the plate number. */
  plate: number;
  group: FeatureGroup;
  slugEn: string;
  slugEs: string;
  /** Content depth budget. S pages carry FAQ schema and comparison blocks. */
  tier: "S" | "A" | "B";
  /**
   * `coming` features are on the roadmap and must present honestly: the plate
   * carries a chip, the page carries a banner and a waitlist CTA instead of a
   * signup CTA. Never dress one as shipped.
   */
  status: "live" | "coming";
  /** Cross-linked at the foot of the page. Three or four, closest first. */
  related: FeatureKey[];
  en: FeatureContent;
  es: FeatureContent;
};

/**
 * Stage headings. The wording is the pitch, so it is authored, not derived.
 *
 * These live in `types.ts` rather than the catalogue index because the header
 * nav needs them in a CLIENT bundle, and importing them from the index would
 * drag every feature's long form prose along for the ride.
 */
export const FEATURE_GROUP_LABELS: Record<FeatureGroup, { en: string; es: string }> = {
  presence: { en: "Build your presence", es: "Construye tu presencia" },
  found: { en: "Get found", es: "Que te encuentren" },
  booked: { en: "Get booked", es: "Que te reserven" },
  paid: { en: "Get paid", es: "Cobra" },
  run: { en: "Run and grow", es: "Opera y crece" },
};

export function featureGroupLabel(group: FeatureGroup, locale: string): string {
  const label = FEATURE_GROUP_LABELS[group];
  return locale === "es" ? label.es : label.en;
}
