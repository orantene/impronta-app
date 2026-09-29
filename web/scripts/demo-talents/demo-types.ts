/**
 * Shared demo-talent types (kept out of demos.ts so alba.ts can import them
 * without a circular module graph that collapses named exports under tsx).
 */

export type DemoService = {
  name: string;
  description: string;
  pricingType: "hour" | "event" | "per_person" | "per_contact" | "flat_package" | "custom";
  amountMxn: number | null;
  /** Typical length in minutes (shown on the offering). */
  durationMin: number;
  booking: "instant" | "request" | "quote";
  /** Menu category (the category rail). */
  category?: string;
  /** Free change / cancel window in hours (the visit "Changes" fact). */
  cancellationHours?: number;
  /** Options, one picked (absolute MXN price each). */
  variants?: { label: string; priceMxn: number }[];
  /** Stackable extras (MXN on top). */
  extras?: { label: string; priceMxn: number }[];
  /** Priced per unit ("Desde $120 por uña"): stored as `attributes.price_unit`. */
  priceUnit?: { es: string; en: string };
  /** Pack photo key used as this service's thumbnail. */
  photo?: string;
};

/** A photo key from the demo's photo folder (`<key>.jpg`). */
export type DemoPhotoPlan = {
  /** The headshot / hero photo (media variant `card`, first). */
  headshot: string;
  /** Recent work, in order, with caption + the service it links to (index in `services`). */
  work: { key: string; caption: string; service?: number }[];
  /** Everything else the site uses (inset, portrait, service thumbnails). */
  more: string[];
  alt?: Record<string, string>;
};

/** Page copy a demo sets in the builder after the design is applied. */
export type DemoSiteCopy = {
  heroHeading?: string;
  heroEyebrow?: string;
  heroLede?: string;
  /** Proof line under the hero CTAs; `{b}...{/b}` for the bold lead. */
  heroProof?: string;
  ticker?: string[];
  heroInset?: string;
  aboutPhoto?: string;
  menuSubtitle?: string;
  visitExtraFacts?: { label: string; value: string; note?: string }[];
  footerLine?: string;
  brandTagline?: string;
};

export type DemoTalent = {
  /** TAL-93xxx is reserved for this batch (TAL-91xxx / 92xxx are older demos). */
  profileCode: string;
  email: string;
  displayName: string;
  siteSlug: string;
  city: string;
  serviceCategorySlug: string;
  /** L3 talent_type slug, written as the primary talent_profile_taxonomy row. */
  talentTypeSlug: string;
  /** Live Design slug applied by apply-maison.mts ("maison", "maison-v2", "solace", "mono", "frame", "folio"). */
  theme: string;
  tagline: string;
  bio: string;
  services: DemoService[];
  /** Working hours for instant services (talent_booking_hours). Days: 0=Sun. */
  hours?: { timezone: string; days: number[]; startMin: number; endMin: number; slotMinutes: number };
  /** Gallery palette key of `theme` (collection designs), e.g. "rose". */
  palette?: string;
  /** Photos from a local folder (`--photo-dir`), instead of a --photos pack. */
  photos?: DemoPhotoPlan;
  /** Published FAQ items (talent_faq_items). */
  faq?: { q: string; a: string }[];
  /** Demo reviews: labelled "Demo review" on the site (the talent is_demo). */
  reviews?: { name: string; body: string }[];
  siteCopy?: DemoSiteCopy;
  /**
   * Private profile fields so the checklist reads 100% (never shown on the
   * site). Fictional; the phone is an all-zero placeholder, not a real line.
   */
  profile?: { lastName: string; phone: string; gender: "female" | "male"; dateOfBirth: string };
  /** Published social_links on talent_profiles (Instagram etc.). */
  socialLinks?: { platform: string; href: string }[];
};
