/**
 * Central registry for marketing lifestyle imagery.
 *
 * Every photo slot is defined here — the scene, the author credit, the alt
 * text, and a crop hint. Components reference slots by key, which keeps image
 * choice out of UI code and lets the whole photography layer be re-curated in
 * a single file when we commission or replace shots.
 *
 * Current sources: project-owned AI-generated editorial photos bundled under
 * `/public/marketing/photos`. Keeping them local makes the marketing site feel
 * curated and keeps the surface from depending on remote stock-photo crops.
 */
export type MarketingPhoto = {
  key: string;
  url: (params?: { w?: number; q?: number }) => string;
  alt: string;
  /** Intent of the scene — helps future curators swap without losing meaning. */
  intent: string;
  /** Focal point for object-position, keeps subject in frame on crop. */
  focal: "center" | "top" | "bottom" | "left-center" | "right-center";
};

const local =
  (path: string, alt: string, intent: string, focal: MarketingPhoto["focal"] = "center") =>
  (key: string): MarketingPhoto => ({
    key,
    url: () => path,
    alt,
    intent,
    focal,
  });

export const MARKETING_PHOTOS = {
  /** Homepage hero — many kinds of talent and service work can become income. */
  heroServices: local(
    "/marketing/photos/talent-services-hero.jpg",
    "Singer, chef, cleaner, and beauty professional working in a premium modern studio",
    "Multiple service professionals turning their work into a business",
    "center",
  )("heroServices"),

  /** Talent CTA — a young adult performer checking a booking on her phone. */
  talentBooking: local(
    "/marketing/photos/independent-singer-booking.jpg",
    "Independent singer smiling while checking a booking on her phone in a rehearsal room",
    "Individual talent feeling the business value of one good booking",
    "top",
  )("talentBooking"),

  /** Agency/workspace CTA — a team building their roster website and pipeline. */
  agencyBuilder: local(
    "/marketing/photos/agency-workspace-builder.jpg",
    "Small agency team reviewing a roster website and inquiry dashboard together",
    "Agency owner building a polished workspace business",
    "center",
  )("agencyBuilder"),

  /** Service marketplace band — real people doing high-value work. */
  servicePros: local(
    "/marketing/photos/service-pros-lifestyle.jpg",
    "Cleaner, chef, makeup artist, and fitness professional working in bright premium spaces",
    "Attractive real-life service categories that can sell through Tulala",
    "center",
  )("servicePros"),

  /** Agencies and hubs discovery page — choosing where to apply next. */
  hubDiscovery: local(
    "/marketing/photos/hub-agency-discovery.jpg",
    "Adult talent reviewing agency and hub opportunities on a tablet in a creative studio",
    "Talent browsing agencies and hubs as a premium opportunity network",
    "right-center",
  )("hubDiscovery"),

  /** Independent operator — solo professional, warm tone. */
  operator: local(
    "/marketing/photos/independent-singer-booking.jpg",
    "Independent singer smiling while checking a booking on her phone in a rehearsal room",
    "Solo professional, polished and ready to earn",
    "top",
  )("operator"),

  /** Agency — coordinated team reviewing work at a long workspace table. */
  agency: local(
    "/marketing/photos/agency-workspace-builder.jpg",
    "Small agency team reviewing a roster website and inquiry dashboard together",
    "Collaborative agency coordination",
    "center",
  )("agency"),

  /** Organization — modern open-plan workspace for scaled teams. */
  organization: local(
    "/marketing/photos/hub-agency-discovery.jpg",
    "Talent browsing agency and hub opportunities in a modern creative studio",
    "Scale, discovery, and network selection",
    "right-center",
  )("organization"),

  /** Homepage lifestyle band — services and talent in motion. */
  reviewMoment: local(
    "/marketing/photos/service-pros-lifestyle.jpg",
    "Cleaner, chef, makeup artist, and fitness professional working in bright premium spaces",
    "The real-life work people can package and sell through Tulala",
    "center",
  )("reviewMoment"),

  /** /get-started side — welcoming, buyer-focused portrait. */
  welcome: local(
    "/marketing/photos/independent-singer-booking.jpg",
    "Independent singer smiling while checking a booking on her phone in a rehearsal room",
    "Welcoming, low-stakes, talent-focused",
    "top",
  )("welcome"),

  /** /integrations — devices, surfaces, systems. */
  systems: local(
    "/marketing/photos/agency-workspace-builder.jpg",
    "Small agency team reviewing a roster website and inquiry dashboard together",
    "Systems, integrations, multi-surface workspace",
    "center",
  )("systems"),
} as const;

export type MarketingPhotoKey = keyof typeof MARKETING_PHOTOS;
