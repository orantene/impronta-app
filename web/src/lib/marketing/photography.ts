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

  /* ── Fresh 2026 set — distinct, single-subject scenes (no phone/laptop clichés) ── */
  audienceTalent: local(
    "/marketing/photos/mk-audience-talent.jpg",
    "Musician absorbed in playing electric guitar in warm studio light",
    "A single creative fully absorbed in their craft",
    "center",
  )("audienceTalent"),
  audienceBusiness: local(
    "/marketing/photos/mk-audience-business.jpg",
    "Independent cafe owner standing behind the counter of her coffee shop",
    "A confident small-business owner in their own space",
    "center",
  )("audienceBusiness"),
  audienceHub: local(
    "/marketing/photos/mk-audience-hub.jpg",
    "Creative production team collaborating on a photo shoot in a studio",
    "A collective of service professionals working together",
    "center",
  )("audienceHub"),
  heroPerform: local(
    "/marketing/photos/mk-hero-perform.jpg",
    "DJ performing to a packed crowd under dramatic stage lights",
    "An aspirational performer earning from their craft",
    "center",
  )("heroPerform"),
  heroService: local(
    "/marketing/photos/mk-hero-service.jpg",
    "Massage therapist delivering a treatment in a bright, calm studio",
    "A premium service professional at work",
    "center",
  )("heroService"),
  heroBusiness: local(
    "/marketing/photos/mk-hero-business.jpg",
    "Cafe owner managing orders on a tablet while running their coffee shop",
    "A business owner running their own business",
    "center",
  )("heroBusiness"),
} as const;

export type MarketingPhotoKey = keyof typeof MARKETING_PHOTOS;

/**
 * Case-study lifestyle imagery. One photo per story card, curated to match the
 * craft (singer, chef, salon, hub, etc.). Files live under
 * `/public/marketing/photos/case-studies/` and are graded through
 * `EditorialFrame` like the rest of the surface so they stay on-palette.
 */
export const CASE_STUDY_PHOTOS = {
  singer: local(
    "/marketing/photos/case-studies/cs-singer.jpg",
    "Singer-songwriter performing with a microphone in a warm studio",
    "Independent performer turning music into bookings",
    "center",
  )("cs-singer"),
  massage: local(
    "/marketing/photos/case-studies/cs-massage.jpg",
    "Serene massage therapy treatment in a calm wellness space",
    "Solo wellness professional taking online reservations",
    "center",
  )("cs-massage"),
  wedding: local(
    "/marketing/photos/case-studies/cs-wedding.jpg",
    "Golden-hour wedding moment captured by a photographer",
    "Wedding professional booking destination clients",
    "center",
  )("cs-wedding"),
  tattoo: local(
    "/marketing/photos/case-studies/cs-tattoo.jpg",
    "Tattoo artist working on a client in a modern studio",
    "Tattoo artist running a deposit-backed waitlist",
    "center",
  )("cs-tattoo"),
  band: local(
    "/marketing/photos/case-studies/cs-band.jpg",
    "Live band performing on a stage under warm lights",
    "Music collective operating as a business",
    "center",
  )("cs-band"),
  salon: local(
    "/marketing/photos/case-studies/cs-salon.jpg",
    "Hair stylist at work in a bright modern salon",
    "Salon team booking every chair online",
    "center",
  )("cs-salon"),
  models: local(
    "/marketing/photos/case-studies/cs-models.jpg",
    "Editorial fashion-model portrait with premium agency styling",
    "Model agency running a branded roster and pipeline",
    "center",
  )("cs-models"),
  fitness: local(
    "/marketing/photos/case-studies/cs-fitness.jpg",
    "Pilates and movement class in a bright airy studio",
    "Boutique studio selling class packs online",
    "center",
  )("cs-fitness"),
  cityhub: local(
    "/marketing/photos/case-studies/cs-city-hub.jpg",
    "Friendly hospitality worker in a warm professional setting",
    "City services hub of vetted local pros",
    "center",
  )("cs-city-hub"),
  chefs: local(
    "/marketing/photos/case-studies/cs-chefs.jpg",
    "Private chef plating a beautifully presented dish",
    "Culinary hub of curated private chefs",
    "center",
  )("cs-chefs"),
  villa: local(
    "/marketing/photos/case-studies/cs-villa.jpg",
    "Luxury villa and pool in an aspirational travel setting",
    "Hospitality hub staffing luxury rentals",
    "center",
  )("cs-villa"),
  hybrid: local(
    "/marketing/photos/case-studies/cs-hybrid.jpg",
    "Makeup artist applying makeup to a client in a studio",
    "Solo artist who grew into running her own studio",
    "center",
  )("cs-hybrid"),
} as const;

export type CaseStudyPhotoKey = keyof typeof CASE_STUDY_PHOTOS;
