/**
 * Curated mock roster for Muse Bridal Collective.
 *
 * Field-model mapping (every field below corresponds to a real column
 * we'd want on `professional_profiles` or a wedding-template extension):
 *
 *   slug                 → profile.slug
 *   name                 → profile.display_name
 *   serviceSlug          → profile.primary_service  (FK → taxonomy.services)
 *   role                 → profile.role_label        (free-text subtitle)
 *   baseLocation         → profile.base_location    (structured city+country)
 *   intro                → profile.intro             (short bio)
 *   about                → profile.about             (long bio, rich-text)
 *   specialties          → profile.specialties[]    (chip taxonomy)
 *   eventStyles          → profile.event_styles[]   (chip taxonomy)
 *   languages            → profile.languages[]
 *   destinations         → profile.destination_areas[]
 *   travelsGlobally      → profile.travel_available (boolean)
 *   teamSize             → profile.team_size
 *   leadTime             → profile.lead_time_weeks
 *   startingFrom         → profile.starting_from    (price teaser)
 *   bookingNote          → profile.booking_note
 *   portrait             → media (cover portrait)
 *   portfolio            → media[] (gallery)
 *   testimonials         → testimonial_items[]
 *   social               → profile.social_links
 *   related              → computed from same service / shared tags
 */

import { IMAGERY } from "./imagery";

export type ProfessionalTestimonial = {
  quote: string;
  author: string;
  context: string;
};

export type Professional = {
  slug: string;
  name: string;
  serviceSlug: string;
  role: string;
  baseLocation: string;
  intro: string;
  about: string[];
  specialties: string[];
  eventStyles: string[];
  languages: string[];
  destinations: string[];
  travelsGlobally: boolean;
  teamSize: string;
  leadTime: string;
  startingFrom: string;
  bookingNote: string;
  portrait: string;
  portfolio: string[];
  testimonials: ProfessionalTestimonial[];
  social: { label: string; href: string }[];
  featured?: boolean;
};

export const PROFESSIONALS: Professional[] = [
  {
    slug: "aurelia-cruz",
    name: "Aurelia Cruz",
    serviceSlug: "bridal-makeup",
    role: "Bridal Makeup Artist",
    baseLocation: "Tulum, Mexico",
    intro:
      "Long-wear romantic glam, editorial softness, and a quiet on-set energy.",
    about: [
      "Aurelia trained in Milan before bringing her editorial sensibility home to the Yucatán. Her work has been commissioned by Vogue Mexico, Conde Nast Traveller, and private clients across three continents.",
      "She is known among planners for her unflappable calm — the artist you want in the getting-ready suite when the bridal party is six deep and the light keeps changing.",
    ],
    specialties: [
      "Natural romantic glam",
      "Long-wear for destinations",
      "Editorial statement",
      "Multi-look days",
    ],
    eventStyles: ["Beachfront ceremonies", "Editorial weddings", "Destination celebrations"],
    languages: ["English", "Spanish", "Italian"],
    destinations: ["Tulum", "Riviera Maya", "Los Cabos", "Ibiza"],
    travelsGlobally: true,
    teamSize: "1–3 artists",
    leadTime: "8–12 weeks",
    startingFrom: "From US$1,400",
    bookingNote:
      "Weekday rates available through September. Travel quotes include same-day trial when possible.",
    portrait: IMAGERY.portraitA,
    portfolio: [
      IMAGERY.portfolioA,
      IMAGERY.portfolioC,
      IMAGERY.portfolioE,
      IMAGERY.portfolioG,
    ],
    testimonials: [
      {
        quote:
          "Aurelia made me feel like myself — only luminous. The photos still look alive a year later.",
        author: "Camila & Rodrigo",
        context: "Tulum, February 2025",
      },
    ],
    social: [
      { label: "Instagram", href: "https://instagram.com" },
      { label: "Portfolio", href: "#" },
    ],
    featured: true,
  },
  {
    slug: "elena-marchetti",
    name: "Elena Marchetti",
    serviceSlug: "hair-styling",
    role: "Editorial Bridal Hair",
    baseLocation: "Mexico City, Mexico",
    intro:
      "Structural chignons, Hollywood waves, and understated volume built for long days.",
    about: [
      "Elena is one of the most sought-after bridal hair artists across Latin America. She travels with her own lighting kit and a second stylist for bridal parties of four or more.",
      "Her signature is the low architectural chignon — the kind that holds through a ceremony, cocktail hour, and a humid rooftop first dance without a single pin slipping.",
    ],
    specialties: [
      "Classical chignons",
      "Romantic waves",
      "Braided installations",
      "Destination humidity",
    ],
    eventStyles: ["Luxury city weddings", "Editorial celebrations", "Intimate private events"],
    languages: ["English", "Spanish"],
    destinations: ["Mexico City", "Los Cabos", "Valle de Guadalupe", "Mérida"],
    travelsGlobally: true,
    teamSize: "Solo + second artist",
    leadTime: "6–10 weeks",
    startingFrom: "From US$1,250",
    bookingNote: "Two looks (ceremony + reception) included on full-day bookings.",
    portrait: IMAGERY.portraitB,
    portfolio: [
      IMAGERY.portfolioB,
      IMAGERY.portfolioD,
      IMAGERY.portfolioF,
      IMAGERY.portfolioH,
    ],
    testimonials: [
      {
        quote:
          "Elena quietly turned a chaotic morning into the calmest room of the day.",
        author: "Valentina M.",
        context: "Valle de Guadalupe, May 2025",
      },
    ],
    social: [{ label: "Instagram", href: "https://instagram.com" }],
    featured: true,
  },
  {
    slug: "mateo-lange",
    name: "Mateo Lange",
    serviceSlug: "photography",
    role: "Editorial Wedding Photographer",
    baseLocation: "Los Cabos, Mexico",
    intro:
      "Warm documentary with a fashion-editor's eye — loved for light-led portraits.",
    about: [
      "Mateo shoots on medium format digital and 35mm film. His work has anchored features for Martha Stewart Weddings, Brides, and Hola! México. He travels with one assistant and a dedicated lighting tech.",
      "His tempo on a wedding day is slow — he finds the moment rather than staging it. Clients who love candid warmth over curated posing gravitate here.",
    ],
    specialties: [
      "Documentary warmth",
      "Film + digital hybrid",
      "Golden-hour portraits",
      "Editorial styling",
    ],
    eventStyles: ["Beachfront ceremonies", "Editorial weddings", "Modern city weddings"],
    languages: ["English", "Spanish", "German"],
    destinations: ["Los Cabos", "Tulum", "Ibiza", "Amalfi Coast"],
    travelsGlobally: true,
    teamSize: "Lead + assistant + tech",
    leadTime: "12–20 weeks",
    startingFrom: "From US$8,500",
    bookingNote:
      "Film-hybrid coverage includes 24-frame fine-art album and a pre-wedding editorial half-day.",
    portrait: IMAGERY.portraitC,
    portfolio: [
      IMAGERY.portfolioD,
      IMAGERY.portfolioA,
      IMAGERY.portfolioF,
      IMAGERY.portfolioB,
    ],
    testimonials: [
      {
        quote:
          "Every frame looks like something we'll hang on the wall. Worth every conversation.",
        author: "Priya & Dev",
        context: "Amalfi Coast, September 2025",
      },
      {
        quote:
          "Mateo is the only photographer our planner refused to compromise on.",
        author: "Ana Laura, planner",
        context: "Los Cabos, 2024",
      },
    ],
    social: [
      { label: "Instagram", href: "https://instagram.com" },
      { label: "Portfolio", href: "#" },
    ],
    featured: true,
  },
  {
    slug: "juno-rivera",
    name: "Juno Rivera",
    serviceSlug: "videography",
    role: "Wedding Filmmaker",
    baseLocation: "Mexico City, Mexico",
    intro:
      "Cinematic films with the rhythm of a short documentary — memories that feel alive.",
    about: [
      "Juno's team shoots three-camera hybrid (documentary + cinematic) with licensed drone coverage across Mexico and the Caribbean. Same-day social reels are delivered before the after-party.",
      "A full film is delivered in 4–8 weeks, with a 30-second teaser for Instagram in 48 hours.",
    ],
    specialties: [
      "Cinematic films",
      "Drone coverage",
      "Same-day reels",
      "Documentary storytelling",
    ],
    eventStyles: ["Destination celebrations", "Multi-day programs", "Editorial weddings"],
    languages: ["English", "Spanish"],
    destinations: ["Tulum", "Los Cabos", "Mexico City", "Oaxaca"],
    travelsGlobally: true,
    teamSize: "3-person film team",
    leadTime: "10–16 weeks",
    startingFrom: "From US$6,900",
    bookingNote: "Drone permits handled in-house for Tulum and the Riviera Maya.",
    portrait: IMAGERY.portraitD,
    portfolio: [
      IMAGERY.portfolioF,
      IMAGERY.portfolioB,
      IMAGERY.portfolioH,
      IMAGERY.portfolioC,
    ],
    testimonials: [
      {
        quote:
          "The teaser landed before we'd even left the venue. Everyone watched it and cried all over again.",
        author: "Sofia & James",
        context: "Tulum, November 2024",
      },
    ],
    social: [{ label: "Instagram", href: "https://instagram.com" }],
    featured: true,
  },
  {
    slug: "isabela-kwon",
    name: "Isabela Kwon",
    serviceSlug: "planning",
    role: "Destination Wedding Planner",
    baseLocation: "Los Cabos, Mexico",
    intro:
      "Partial and full-service planning for multi-day celebrations and private estates.",
    about: [
      "Isabela leads a team of four coordinators and specializes in three-day programs across Mexico and the Mediterranean. Her planning deck is legendary among vendors — color-coded, trilingual, and delivered four weeks ahead.",
      "She is the planner we send our own brides to.",
    ],
    specialties: [
      "Full-service planning",
      "Multi-day programs",
      "Private estates",
      "Vendor curation",
    ],
    eventStyles: ["Destination celebrations", "Luxury city weddings", "Private estates"],
    languages: ["English", "Spanish", "Korean"],
    destinations: ["Los Cabos", "Tulum", "Amalfi Coast", "Mallorca"],
    travelsGlobally: true,
    teamSize: "Lead + 3 coordinators",
    leadTime: "16–36 weeks",
    startingFrom: "From US$18,000",
    bookingNote:
      "Full-service bookings include welcome-party + brunch planning at no extra fee.",
    portrait: IMAGERY.portraitE,
    portfolio: [
      IMAGERY.portfolioC,
      IMAGERY.portfolioA,
      IMAGERY.portfolioG,
      IMAGERY.portfolioE,
    ],
    testimonials: [
      {
        quote:
          "Isabela absorbed every decision so we could just… be there. That is rarer than it sounds.",
        author: "Ruby & Oliver",
        context: "Mallorca, June 2025",
      },
    ],
    social: [{ label: "Instagram", href: "https://instagram.com" }],
    featured: true,
  },
  {
    slug: "florencia-real",
    name: "Florencia Real",
    serviceSlug: "floral-design",
    role: "Floral & Event Designer",
    baseLocation: "Tulum, Mexico",
    intro:
      "Sculptural installations — ceremony arches, ceiling clouds, and one-of-one tablescapes.",
    about: [
      "Florencia is our most-booked floral designer. She sources seasonally from local growers across Quintana Roo and partners with a second studio in Valle de Guadalupe for inland events.",
      "Her work is sensory first: texture, shadow, and fragrance. Expect a real point of view, not a Pinterest replica.",
    ],
    specialties: [
      "Ceremony installations",
      "Ceiling florals",
      "Sculptural tablescapes",
      "Seasonal sourcing",
    ],
    eventStyles: ["Beachfront ceremonies", "Editorial weddings", "Destination celebrations"],
    languages: ["Spanish", "English"],
    destinations: ["Tulum", "Playa del Carmen", "Valle de Guadalupe", "Oaxaca"],
    travelsGlobally: false,
    teamSize: "Lead + 4 florists",
    leadTime: "12–24 weeks",
    startingFrom: "From US$5,800",
    bookingNote:
      "Minimum floral budget applies for Tulum and Riviera Maya peak season (Dec–Apr).",
    portrait: IMAGERY.portraitF,
    portfolio: [
      IMAGERY.portfolioE,
      IMAGERY.portfolioC,
      IMAGERY.portfolioG,
      IMAGERY.portfolioA,
    ],
    testimonials: [
      {
        quote:
          "Florencia's floral ceiling made a pavilion feel like a cathedral.",
        author: "Mia & Sol",
        context: "Tulum, January 2025",
      },
    ],
    social: [
      { label: "Instagram", href: "https://instagram.com" },
      { label: "Studio", href: "#" },
    ],
    featured: true,
  },
  {
    slug: "noor-halabi",
    name: "Noor Halabi",
    serviceSlug: "content-creation",
    role: "Wedding Content Creator",
    baseLocation: "Mexico City, Mexico",
    intro:
      "Same-day social content, vertical-first, with a quiet presence on the ground.",
    about: [
      "Noor and her partner shoot dedicated content-creator coverage: vertical, candid, and lifestyle-first. Clients receive a private link to 60+ edited clips within 24 hours.",
      "She stays out of the way of your photographer and videographer — years of collaborating with Muse's image team shows.",
    ],
    specialties: [
      "Same-day reels",
      "Behind-the-scenes",
      "Vertical-first",
      "Guest-angle storytelling",
    ],
    eventStyles: ["Modern city weddings", "Destination celebrations", "Intimate private events"],
    languages: ["English", "Spanish", "Arabic"],
    destinations: ["Mexico City", "Tulum", "Los Cabos", "Dubai"],
    travelsGlobally: true,
    teamSize: "Duo (2 creators)",
    leadTime: "4–8 weeks",
    startingFrom: "From US$2,400",
    bookingNote: "Includes 6 hours coverage, 60+ vertical clips, and 2 same-day reels.",
    portrait: IMAGERY.portraitG,
    portfolio: [
      IMAGERY.portfolioB,
      IMAGERY.portfolioD,
      IMAGERY.portfolioF,
      IMAGERY.portfolioH,
    ],
    testimonials: [
      {
        quote: "Noor is invisible and everywhere at once. The content is magic.",
        author: "Hana & Omar",
        context: "Dubai, March 2025",
      },
    ],
    social: [{ label: "Instagram", href: "https://instagram.com" }],
    featured: true,
  },
  {
    slug: "alma-libre-strings",
    name: "Alma Libre Strings",
    serviceSlug: "music-performance",
    role: "Ceremony Quartet & Ensemble",
    baseLocation: "Mexico City, Mexico",
    intro:
      "String quartet and expanded ensemble for ceremonies and first dances.",
    about: [
      "Alma Libre is a four-piece string quartet led by Elisa Paredes, with an expanded ensemble option up to nine musicians for cocktail and reception sets.",
      "Their curated library spans classical, contemporary pop (reimagined), and Mexican folk traditions. Every program is tailored to the couple's story.",
    ],
    specialties: [
      "Ceremony strings",
      "First-dance arrangements",
      "Contemporary pop rearranged",
      "Mexican folk traditions",
    ],
    eventStyles: ["Luxury city weddings", "Editorial weddings", "Beachfront ceremonies"],
    languages: ["English", "Spanish"],
    destinations: ["Mexico City", "Oaxaca", "Valle de Guadalupe", "Los Cabos"],
    travelsGlobally: true,
    teamSize: "4–9 musicians",
    leadTime: "6–12 weeks",
    startingFrom: "From US$3,200",
    bookingNote: "Extended ensemble (9 pc) available for reception sets.",
    portrait: IMAGERY.portraitH,
    portfolio: [
      IMAGERY.portfolioA,
      IMAGERY.portfolioD,
      IMAGERY.portfolioE,
      IMAGERY.portfolioB,
    ],
    testimonials: [
      {
        quote:
          "The ceremony ran ten minutes long because no one wanted the music to stop.",
        author: "Camille & Alex",
        context: "Oaxaca, April 2025",
      },
    ],
    social: [
      { label: "Instagram", href: "https://instagram.com" },
      { label: "Listen", href: "https://spotify.com" },
    ],
    featured: true,
  },
  {
    slug: "lucia-pardo",
    name: "Lucía Pardo",
    serviceSlug: "photography",
    role: "Film-Forward Photographer",
    baseLocation: "Oaxaca, Mexico",
    intro:
      "Medium-format film, warm skin tones, and deeply personal documentary.",
    about: [
      "Lucía shoots almost entirely on Pentax 67 and Contax 645 film. She is the photographer to call if you want grainy, textured, deeply human images that feel pulled from a family archive.",
      "She works solo or with one assistant; she does not operate a large team by design.",
    ],
    specialties: [
      "Medium-format film",
      "Documentary intimate",
      "Family portraits",
      "Quiet styling",
    ],
    eventStyles: ["Intimate private events", "Destination celebrations", "Heritage weddings"],
    languages: ["Spanish", "English"],
    destinations: ["Oaxaca", "Mexico City", "Valle de Guadalupe"],
    travelsGlobally: false,
    teamSize: "Solo + optional assistant",
    leadTime: "10–14 weeks",
    startingFrom: "From US$5,400",
    bookingNote: "Film-only coverage; digital scan gallery delivered in 6 weeks.",
    portrait: IMAGERY.portraitI,
    portfolio: [
      IMAGERY.portfolioG,
      IMAGERY.portfolioA,
      IMAGERY.portfolioC,
      IMAGERY.portfolioF,
    ],
    testimonials: [
      {
        quote: "Her frames look like our parents' wedding album, only sharper.",
        author: "Regina & Tomás",
        context: "Oaxaca, 2024",
      },
    ],
    social: [{ label: "Instagram", href: "https://instagram.com" }],
  },
  {
    slug: "camille-rousseau",
    name: "Camille Rousseau",
    serviceSlug: "bridal-makeup",
    role: "Clean Beauty Artist",
    baseLocation: "Los Cabos, Mexico",
    intro:
      "Clean, non-toxic beauty with a luminous Parisian-editorial finish.",
    about: [
      "Camille trained at Chanel Paris and now lives in Los Cabos full-time. Her kit is entirely clean-ingredient — a request more brides are asking for.",
      "She is a natural pairing with Mateo's photography list.",
    ],
    specialties: [
      "Clean / non-toxic kit",
      "Luminous French finish",
      "Long-wear at sea",
      "Natural contour",
    ],
    eventStyles: ["Beachfront ceremonies", "Modern city weddings", "Editorial weddings"],
    languages: ["French", "English", "Spanish"],
    destinations: ["Los Cabos", "Tulum", "Provence", "Paris"],
    travelsGlobally: true,
    teamSize: "1–2 artists",
    leadTime: "6–10 weeks",
    startingFrom: "From US$1,600",
    bookingNote: "Trial included for destination bookings of 3+ looks.",
    portrait: IMAGERY.portraitJ,
    portfolio: [
      IMAGERY.portfolioH,
      IMAGERY.portfolioB,
      IMAGERY.portfolioD,
      IMAGERY.portfolioF,
    ],
    testimonials: [
      {
        quote: "I've never had skin look that alive in photos. It's quiet magic.",
        author: "Margot L.",
        context: "Provence, August 2025",
      },
    ],
    social: [{ label: "Instagram", href: "https://instagram.com" }],
  },
  {
    slug: "renata-solera",
    name: "Renata Solera",
    serviceSlug: "floral-design",
    role: "Botanical Installation Artist",
    baseLocation: "Valle de Guadalupe, Mexico",
    intro:
      "Garden-to-table florals: meadow-inspired aisles, earthy tablescapes, cascading installations.",
    about: [
      "Renata grows her own signature varieties in Valle de Guadalupe and designs predominantly for inland estate and vineyard weddings.",
      "Her work is less manicured than urban florists — wilder, more textured, more seasonal.",
    ],
    specialties: ["Meadow aisles", "Wild tablescapes", "Signature grown varieties", "Vineyard estates"],
    eventStyles: ["Luxury city weddings", "Private estates", "Editorial weddings"],
    languages: ["Spanish", "English"],
    destinations: ["Valle de Guadalupe", "Mexico City", "Los Cabos"],
    travelsGlobally: false,
    teamSize: "Lead + 3 florists",
    leadTime: "12–20 weeks",
    startingFrom: "From US$4,900",
    bookingNote: "Signature floral menu updates seasonally; review 10 weeks before event.",
    portrait: IMAGERY.portraitK,
    portfolio: [
      IMAGERY.portfolioE,
      IMAGERY.portfolioC,
      IMAGERY.portfolioG,
      IMAGERY.portfolioA,
    ],
    testimonials: [
      {
        quote: "Everything smelled like the desert after rain. It was transcendent.",
        author: "Julia & Pablo",
        context: "Valle de Guadalupe, May 2025",
      },
    ],
    social: [{ label: "Instagram", href: "https://instagram.com" }],
  },
  {
    slug: "marco-vitale",
    name: "Marco Vitale",
    serviceSlug: "music-performance",
    role: "Resident DJ & Host",
    baseLocation: "Tulum, Mexico",
    intro:
      "Sunset sets that open the dance floor and keep it open until sunrise.",
    about: [
      "Marco has held residencies at Casa Malca and Hotel Bardo. He reads a room like a novel — his crossfades are unhurried and his taste is impeccable.",
      "For destination weddings he provides his own Funktion-One-class stack and a lighting tech.",
    ],
    specialties: ["Sunset openings", "Late-night deep cuts", "Latin jazz blends", "Funktion-One stack"],
    eventStyles: ["Beachfront ceremonies", "Destination celebrations", "Luxury city weddings"],
    languages: ["Italian", "Spanish", "English"],
    destinations: ["Tulum", "Ibiza", "Mykonos", "Los Cabos"],
    travelsGlobally: true,
    teamSize: "Solo + lighting tech",
    leadTime: "8–14 weeks",
    startingFrom: "From US$4,200",
    bookingNote: "Private playlist consultation and first-dance custom edit included.",
    portrait: IMAGERY.portraitL,
    portfolio: [
      IMAGERY.portfolioD,
      IMAGERY.portfolioB,
      IMAGERY.portfolioH,
      IMAGERY.portfolioF,
    ],
    testimonials: [
      {
        quote: "Marco's sunset set is the moment our friends still talk about.",
        author: "Daniel & Noa",
        context: "Tulum, December 2024",
      },
    ],
    social: [
      { label: "Instagram", href: "https://instagram.com" },
      { label: "SoundCloud", href: "https://soundcloud.com" },
    ],
  },
];

export const FEATURED_PROFESSIONALS = PROFESSIONALS.filter((p) => p.featured);

export function getProfessional(slug: string): Professional | undefined {
  return PROFESSIONALS.find((p) => p.slug === slug);
}

export function relatedProfessionals(
  current: Professional,
  limit = 3,
): Professional[] {
  const sameService = PROFESSIONALS.filter(
    (p) => p.serviceSlug === current.serviceSlug && p.slug !== current.slug,
  );
  const overlapsTags = PROFESSIONALS.filter(
    (p) =>
      p.slug !== current.slug &&
      p.serviceSlug !== current.serviceSlug &&
      p.eventStyles.some((s) => current.eventStyles.includes(s)),
  );
  const out: Professional[] = [];
  for (const p of [...sameService, ...overlapsTags]) {
    if (!out.find((o) => o.slug === p.slug)) out.push(p);
    if (out.length >= limit) break;
  }
  return out;
}

export const ALL_DESTINATIONS = Array.from(
  new Set(PROFESSIONALS.flatMap((p) => p.destinations)),
).sort();

export const ALL_EVENT_STYLES = Array.from(
  new Set(PROFESSIONALS.flatMap((p) => p.eventStyles)),
).sort();

export const ALL_LANGUAGES = Array.from(
  new Set(PROFESSIONALS.flatMap((p) => p.languages)),
).sort();
