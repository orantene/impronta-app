/**
 * Central registry for marketing lifestyle imagery.
 *
 * Every photo slot is defined here — the scene, the author credit, the alt
 * text, and a crop hint. Components reference slots by key, which keeps image
 * choice out of UI code and lets the whole photography layer be re-curated in
 * a single file when we commission or replace shots.
 *
 * Current sources: curated Unsplash editorial photos served from
 * `images.unsplash.com`. The CSP allows `img-src https:` so direct `<img>`
 * tags work without next.config changes. Replace `url` with a Supabase
 * storage path or a bundled asset when we ship commissioned photography.
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

const unsplash =
  (id: string, alt: string, intent: string, focal: MarketingPhoto["focal"] = "center") =>
  (key: string): MarketingPhoto => ({
    key,
    url: ({ w = 1200, q = 72 } = {}) =>
      `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=${q}`,
    alt,
    intent,
    focal,
  });

export const MARKETING_PHOTOS = {
  /** Independent operator — solo professional, warm tone. */
  operator: unsplash(
    "1551836022-deb4988cc6c0",
    "Independent operator reviewing roster on a laptop in a bright workspace",
    "Solo, focused, polished work",
    "center",
  )("operator"),

  /** Agency — coordinated team reviewing work at a long workspace table. */
  agency: unsplash(
    "1521737604893-d14cc237f11d",
    "Agency team reviewing a roster together around a meeting table",
    "Collaborative team coordination",
    "center",
  )("agency"),

  /** Organization — modern open-plan workspace for scaled teams. */
  organization: unsplash(
    "1556761175-4b46a572b786",
    "Modern open-plan workspace for a larger placement organization",
    "Scale, operations, infrastructure feel",
    "center",
  )("organization"),

  /** Homepage lifestyle band — "we review rosters calmly now" gesture. */
  reviewMoment: unsplash(
    "1517245386807-bb43f82c33c4",
    "Two people reviewing a roster together on a laptop, hands gesturing",
    "The human review moment the platform replaces with structure",
    "center",
  )("reviewMoment"),

  /** /get-started side — welcoming, buyer-focused portrait. */
  welcome: unsplash(
    "1573497019940-1c28c88b4f3e",
    "Operator smiling confidently in a bright workspace",
    "Welcoming, low-stakes, buyer-focused",
    "top",
  )("welcome"),

  /** /integrations — devices, surfaces, systems. */
  systems: unsplash(
    "1519389950473-47ba0277781c",
    "Top-down desk view with multiple devices — laptops, phones, notebooks",
    "Systems, integrations, multi-surface",
    "center",
  )("systems"),
} as const;

export type MarketingPhotoKey = keyof typeof MARKETING_PHOTOS;
