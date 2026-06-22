/**
 * Demo personas + imagery for template previews.
 *
 * Each template gets a believable persona (name, role, bio, city) and a set of
 * lifestyle images so the eye-icon preview renders a *finished* page even though
 * no real talent data is involved. Image paths are root-relative `/public`
 * paths; {@link resolveDemoContext} absolutises them via the request origin so
 * they satisfy the section schemas' `z.string().url()` checks.
 *
 * INTERIM IMAGERY: these currently reuse the marketing photo library. The
 * curated-imagery pass swaps in profession-perfect shots under
 * `/talent-templates/demo/<key>/` — only these path constants change, no
 * structural edits to templates.
 */
import type { TemplateBuildContext } from "./types";

const M = "/marketing/photos";
const CS = "/marketing/photos/case-studies";

export type DemoPersona = {
  displayName: string;
  profileCode: string;
  primaryTypeLabel: string;
  publicBio: string;
  homeCity: string;
  serviceAreaLabels: string[];
  /** Root-relative hero / portrait image. */
  heroPath: string;
  /** Root-relative gallery images (3+ recommended). */
  galleryPaths: string[];
};

/** Generic lifestyle set reused by the profession-agnostic base templates. */
const BASE_GALLERY = [
  `${M}/talent-services-hero.jpg`,
  `${M}/service-pros-lifestyle.jpg`,
  `${M}/mk-hero-service.jpg`,
  `${M}/mk-audience-talent.jpg`,
  `${M}/agency-workspace-builder.jpg`,
  `${CS}/cs-fitness.jpg`,
];

export const DEMO_PERSONAS: Record<string, DemoPersona> = {
  // ── Free bases ────────────────────────────────────────────────────────────
  "tulala-digital": {
    displayName: "Alex Rivera",
    profileCode: "DEMO-BASE",
    primaryTypeLabel: "Creative professional",
    publicBio:
      "I help brands and people bring ideas to life. Based between studio and on-location work, I take on a handful of projects at a time so every one gets full attention.",
    homeCity: "Mexico City",
    serviceAreaLabels: ["Mexico City", "Guadalajara", "Remote"],
    heroPath: `${M}/talent-services-hero.jpg`,
    galleryPaths: BASE_GALLERY,
  },
  "base-minimal": {
    displayName: "Sam Okonkwo",
    profileCode: "DEMO-MINIMAL",
    primaryTypeLabel: "Independent creative",
    publicBio:
      "Less, but better. A focused practice built on clear communication, dependable timelines, and work I'm proud to put my name on.",
    homeCity: "Monterrey",
    serviceAreaLabels: ["Monterrey", "Nationwide"],
    heroPath: `${M}/service-pros-lifestyle.jpg`,
    galleryPaths: BASE_GALLERY,
  },
  "base-bold": {
    displayName: "Río Martín",
    profileCode: "DEMO-BOLD",
    primaryTypeLabel: "Multidisciplinary talent",
    publicBio:
      "Big ideas, made real. I bring energy and craft to every brief — from first call to final delivery — and I love a project with ambition behind it.",
    homeCity: "Mexico City",
    serviceAreaLabels: ["Mexico City", "Worldwide"],
    heroPath: `${M}/mk-hero-perform.jpg`,
    galleryPaths: [
      `${M}/mk-hero-perform.jpg`,
      `${CS}/cs-singer.jpg`,
      `${M}/mk-audience-talent.jpg`,
      `${CS}/cs-band.jpg`,
      `${M}/talent-services-hero.jpg`,
      `${M}/service-pros-lifestyle.jpg`,
    ],
  },

  // ── Pro professions (slice 1) ──────────────────────────────────────────────
  singer: {
    displayName: "Daniela Sol",
    profileCode: "DEMO-SINGER",
    primaryTypeLabel: "Indie singer-songwriter",
    publicBio:
      "Songs that fill a room without raising their voice. I play intimate sets for weddings, private events, and venue nights — voice, guitar, and a loop pedal when the moment calls for it.",
    homeCity: "Mexico City",
    serviceAreaLabels: ["Mexico City", "Oaxaca", "Tulum"],
    heroPath: `${M}/independent-singer-booking.jpg`,
    galleryPaths: [
      `${CS}/cs-singer.jpg`,
      `${CS}/cs-band.jpg`,
      `${M}/mk-hero-perform.jpg`,
      `${M}/mk-audience-talent.jpg`,
      `${M}/independent-singer-booking.jpg`,
      `${M}/talent-services-hero.jpg`,
    ],
  },
  chef: {
    displayName: "Lucía Fernández",
    profileCode: "DEMO-CHEF",
    primaryTypeLabel: "Private chef",
    publicBio:
      "Seasonal menus cooked in your kitchen. I design tasting experiences around the people at the table — market-led, unfussy, and plated like a restaurant night at home.",
    homeCity: "Guadalajara",
    serviceAreaLabels: ["Guadalajara", "Mexico City", "Riviera Nayarit"],
    heroPath: `${CS}/cs-chefs.jpg`,
    galleryPaths: [
      `${CS}/cs-chefs.jpg`,
      `${M}/mk-hosts-restaurant.jpg`,
      `${M}/mk-hero-service.jpg`,
      `${M}/service-pros-lifestyle.jpg`,
    ],
  },
  model: {
    displayName: "Noa Castell",
    profileCode: "DEMO-MODEL",
    primaryTypeLabel: "Fashion & runway model",
    publicBio:
      "Editorial, runway, and brand campaigns. Represented work across fashion weeks and lookbooks — I bring range, professionalism, and an easy set presence.",
    homeCity: "Mexico City",
    serviceAreaLabels: ["Mexico City", "New York", "Milan"],
    heroPath: `${M}/mk-models-runway.jpg`,
    galleryPaths: [
      `${M}/mk-models-runway.jpg`,
      `${CS}/cs-models.jpg`,
      `${M}/mk-models-party.jpg`,
      `${M}/mk-audience-talent.jpg`,
      `${M}/talent-services-hero.jpg`,
    ],
  },
  tattoo: {
    displayName: "Iván Mora",
    profileCode: "DEMO-TATTOO",
    primaryTypeLabel: "Tattoo artist",
    publicBio:
      "Fine-line and blackwork, booked by the piece. I take a limited number of custom projects each month so each design gets the time it deserves — consultation to healed.",
    homeCity: "Mexico City",
    serviceAreaLabels: ["Mexico City", "Guest spots worldwide"],
    heroPath: `${CS}/cs-tattoo.jpg`,
    galleryPaths: [
      `${CS}/cs-tattoo.jpg`,
      `${M}/service-pros-lifestyle.jpg`,
      `${M}/mk-hero-perform.jpg`,
      `${CS}/cs-salon.jpg`,
    ],
  },
};

const FALLBACK_KEY = "tulala-digital";

/** Build a demo TemplateBuildContext with absolute image URLs for previews. */
export function resolveDemoContext(
  templateKey: string,
  origin: string,
): TemplateBuildContext {
  const persona = DEMO_PERSONAS[templateKey] ?? DEMO_PERSONAS[FALLBACK_KEY];
  const abs = (path: string) =>
    /^https?:\/\//i.test(path) ? path : `${origin}${path}`;

  return {
    profile: {
      displayName: persona.displayName,
      profileCode: persona.profileCode,
      primaryTypeLabel: persona.primaryTypeLabel,
      publicBio: persona.publicBio,
      homeCity: persona.homeCity,
      serviceAreaLabels: persona.serviceAreaLabels,
      headshotUrl: abs(persona.heroPath),
    },
    media: persona.galleryPaths.map((p) => ({
      url: abs(p),
      alt: persona.displayName,
    })),
    mode: "demo",
  };
}

/** Card thumbnail for the picker — a representative image (root-relative ok). */
export function demoThumbnailPath(templateKey: string): string {
  const persona = DEMO_PERSONAS[templateKey] ?? DEMO_PERSONAS[FALLBACK_KEY];
  return persona.heroPath;
}
