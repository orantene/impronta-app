/**
 * Builder-node composition presets — ready-made one-click "Section pack"
 * blocks. Metadata + dispatcher here; factories in
 * ./composition-preset-factories.
 */

import type { BuilderNode, BuilderNodeKind } from "./types";
import {
  createAgencySearchHeroPreset,
  createFeaturedTalentGridPreset,
  createEditorialStorySplitPreset,
  createLocationProofBandPreset,
  createFaqConversionStackPreset,
  createCtaBandPreset,
  createFeatureTrioPreset,
  createStatBandPreset,
  createPricingCardPreset,
  createTestimonialCardPreset,
  createLogoCloudPreset,
  createGalleryStripPreset,
  createNewsletterSignupPreset,
} from "./composition-preset-factories";

export type BuilderNodeCompositionPresetId =
  | "agency-search-hero"
  | "featured-talent-grid"
  | "editorial-story-split"
  | "location-proof-band"
  | "faq-conversion-stack"
  | "cta-band"
  | "feature-trio"
  | "stat-band"
  | "pricing-card"
  | "testimonial-card"
  | "logo-cloud"
  | "gallery-strip"
  | "newsletter-signup";

export interface BuilderNodeCompositionPreset {
  id: BuilderNodeCompositionPresetId;
  label: string;
  description: string;
  rootKind: Extract<BuilderNodeKind, "container" | "split" | "accordion" | "card">;
  category: "hero" | "data" | "story" | "trust" | "conversion";
  dataMode: "starter" | "data-ready";
  keywords: ReadonlyArray<string>;
  sectionCount: number;
}

export const BUILDER_NODE_COMPOSITION_PRESETS: ReadonlyArray<BuilderNodeCompositionPreset> = [
  {
    id: "agency-search-hero",
    label: "Agency search hero",
    description: "Editorial headline, natural-language search copy, and quick actions.",
    rootKind: "container",
    category: "hero",
    dataMode: "data-ready",
    keywords: ["search", "directory", "lead", "hero", "browse"],
    sectionCount: 5,
  },
  {
    id: "featured-talent-grid",
    label: "Featured talent grid",
    description: "Roster-led cards with real-looking portrait defaults.",
    rootKind: "container",
    category: "data",
    dataMode: "data-ready",
    keywords: ["roster", "talent", "profiles", "featured", "database"],
    sectionCount: 6,
  },
  {
    id: "editorial-story-split",
    label: "Editorial story split",
    description: "Image-led narrative block with CTA and responsive split behavior.",
    rootKind: "split",
    category: "story",
    dataMode: "starter",
    keywords: ["story", "about", "editorial", "image", "brand"],
    sectionCount: 5,
  },
  {
    id: "location-proof-band",
    label: "Location proof band",
    description: "Location buttons, proof copy, and visual map placeholder.",
    rootKind: "container",
    category: "trust",
    dataMode: "data-ready",
    keywords: ["locations", "map", "cities", "market", "proof"],
    sectionCount: 7,
  },
  {
    id: "faq-conversion-stack",
    label: "FAQ conversion stack",
    description: "Accordion answers plus a direct inquiry CTA.",
    rootKind: "container",
    category: "conversion",
    dataMode: "starter",
    keywords: ["faq", "accordion", "questions", "conversion", "inquiry"],
    sectionCount: 6,
  },
  {
    id: "cta-band",
    label: "CTA band",
    description: "Centered headline, supporting line, and a single primary action.",
    rootKind: "container",
    category: "conversion",
    dataMode: "starter",
    keywords: ["cta", "call to action", "convert", "banner", "signup", "contact"],
    sectionCount: 3,
  },
  {
    id: "feature-trio",
    label: "Feature trio",
    description: "Three side-by-side feature cards with heading and copy.",
    rootKind: "container",
    category: "story",
    dataMode: "starter",
    keywords: ["features", "benefits", "three", "columns", "cards", "grid"],
    sectionCount: 4,
  },
  {
    id: "pricing-card",
    label: "Pricing card",
    description: "A single plan card — price, feature list, and a call to action.",
    rootKind: "card",
    category: "conversion",
    dataMode: "starter",
    keywords: ["pricing", "plan", "tier", "price", "subscribe", "buy"],
    sectionCount: 5,
  },
  {
    id: "testimonial-card",
    label: "Testimonial",
    description: "A quote with attribution — social proof in one tidy card.",
    rootKind: "card",
    category: "trust",
    dataMode: "starter",
    keywords: ["testimonial", "quote", "review", "social proof", "client"],
    sectionCount: 3,
  },
  {
    id: "logo-cloud",
    label: "Logo cloud",
    description: "A row of partner / client logos with an intro line.",
    rootKind: "container",
    category: "trust",
    dataMode: "starter",
    keywords: ["logos", "clients", "partners", "brands", "trusted by"],
    sectionCount: 5,
  },
  {
    id: "gallery-strip",
    label: "Gallery strip",
    description: "A four-up image row — portfolio, lookbook, or moodboard.",
    rootKind: "container",
    category: "story",
    dataMode: "starter",
    keywords: ["gallery", "images", "portfolio", "grid", "lookbook", "photos"],
    sectionCount: 5,
  },
  {
    id: "newsletter-signup",
    label: "Newsletter signup",
    description: "Headline, supporting line, and an email capture call to action.",
    rootKind: "container",
    category: "conversion",
    dataMode: "starter",
    keywords: ["newsletter", "subscribe", "email", "signup", "capture"],
    sectionCount: 3,
  },
  {
    id: "stat-band",
    label: "Stat band",
    description: "Three big-number stats with labels — instant social proof.",
    rootKind: "container",
    category: "trust",
    dataMode: "starter",
    keywords: ["stats", "numbers", "metrics", "proof", "results", "kpi"],
    sectionCount: 4,
  },
] as const;

export function createBuilderNodeCompositionPreset(
  presetId: BuilderNodeCompositionPresetId,
): Exclude<BuilderNode, { kind: "section" }> {
  switch (presetId) {
    case "agency-search-hero":
      return createAgencySearchHeroPreset();
    case "featured-talent-grid":
      return createFeaturedTalentGridPreset();
    case "editorial-story-split":
      return createEditorialStorySplitPreset();
    case "location-proof-band":
      return createLocationProofBandPreset();
    case "faq-conversion-stack":
      return createFaqConversionStackPreset();
    case "cta-band":
      return createCtaBandPreset();
    case "feature-trio":
      return createFeatureTrioPreset();
    case "stat-band":
      return createStatBandPreset();
    case "pricing-card":
      return createPricingCardPreset();
    case "testimonial-card":
      return createTestimonialCardPreset();
    case "logo-cloud":
      return createLogoCloudPreset();
    case "gallery-strip":
      return createGalleryStripPreset();
    case "newsletter-signup":
      return createNewsletterSignupPreset();
  }
}
