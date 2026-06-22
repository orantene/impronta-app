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
import { createMarqueeTickerPreset } from "./composition-preset-factories-noir";
import { createFooterEditorialPreset } from "./composition-preset-factories-noir-footer";
import { createFeaturedFacesBoardPreset } from "./composition-preset-factories-noir-featured";
import { createTestimonialsTrioPreset } from "./composition-preset-factories-noir-testimonials";
import { createStatBandEditorialPreset } from "./composition-preset-factories-noir-stats";
import { createCampaignsLookbookRailPreset } from "./composition-preset-factories-noir-campaigns";
import { createCtaBannerSpotlightPreset } from "./composition-preset-factories-noir-cta";
import { createDivisionsRowPreset } from "./composition-preset-factories-noir-divisions";
import { createImprontaNoirHomePreset } from "./composition-preset-factories-noir-home";
import {
  createTeamGridPreset,
  createProcessStepsPreset,
  createFeatureComparisonPreset,
  createAnnouncementBarPreset,
} from "./composition-preset-factories-extra";
import {
  createEditorialPortfolioPreset,
  createProductionAgencyPreset,
  createSaasProductPreset,
  createPrintStorePreset,
  createLiveEventPreset,
} from "./composition-preset-factories-page";

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
  | "newsletter-signup"
  | "team-grid"
  | "process-steps"
  | "feature-comparison"
  | "announcement-bar"
  | "editorial-portfolio"
  | "production-agency"
  | "saas-product"
  | "print-store"
  | "live-event"
  | "marquee-ticker"
  | "footer-editorial"
  | "featured-faces-board"
  | "testimonials-trio"
  | "stat-band-editorial"
  | "campaigns-lookbook"
  | "cta-banner-spotlight"
  | "divisions-row"
  | "impronta-noir-home";

export interface BuilderNodeCompositionPreset {
  id: BuilderNodeCompositionPresetId;
  label: string;
  description: string;
  rootKind: Extract<BuilderNodeKind, "container" | "split" | "accordion" | "card">;
  category: "hero" | "data" | "story" | "trust" | "conversion" | "page";
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
  {
    id: "team-grid",
    label: "Team grid",
    description: "A 3-up grid of people — portrait, name, and role.",
    rootKind: "container",
    category: "trust",
    dataMode: "starter",
    keywords: ["team", "people", "about", "staff", "founders", "crew"],
    sectionCount: 5,
  },
  {
    id: "process-steps",
    label: "Process steps",
    description: "Numbered how-it-works steps in a clean horizontal flow.",
    rootKind: "container",
    category: "story",
    dataMode: "starter",
    keywords: ["process", "steps", "how it works", "timeline", "flow", "stages"],
    sectionCount: 5,
  },
  {
    id: "feature-comparison",
    label: "Plan comparison",
    description: "Three plan cards side by side with prices and a CTA each.",
    rootKind: "container",
    category: "conversion",
    dataMode: "starter",
    keywords: ["compare", "plans", "pricing", "tiers", "table", "features"],
    sectionCount: 6,
  },
  {
    id: "announcement-bar",
    label: "Announcement bar",
    description: "A slim full-width banner with a message and an inline action.",
    rootKind: "container",
    category: "conversion",
    dataMode: "starter",
    keywords: ["announcement", "banner", "promo", "notice", "bar", "alert"],
    sectionCount: 2,
  },
  // ── Full-page designs ─────────────────────────────────────────────────
  // Productised versions of the fidelity-harness archetypes: one-click,
  // self-contained full pages (repeaters baked to static cards, real
  // photography, registry fonts) a tenant can drop onto a blank canvas and
  // edit. The same trees are scored at ~90 by the fidelity harness.
  {
    id: "editorial-portfolio",
    label: "Editorial portfolio",
    description:
      "Full page — serif display, an asymmetric full-bleed hero, a selected-series triptych, and a dark statement.",
    rootKind: "container",
    category: "page",
    dataMode: "starter",
    keywords: ["page", "full page", "template", "portfolio", "editorial", "photography", "magazine", "serif"],
    sectionCount: 4,
  },
  {
    id: "production-agency",
    label: "Production agency",
    description:
      "Full page — a fashion-masthead serif, a credits marquee, a roster grid, and a services breakdown.",
    rootKind: "container",
    category: "page",
    dataMode: "starter",
    keywords: ["page", "full page", "template", "agency", "production", "roster", "creative", "masthead"],
    sectionCount: 5,
  },
  {
    id: "saas-product",
    label: "SaaS product",
    description:
      "Full page — a geometric-sans benefit hero, a three-up feature grid, a live console card, and a pricing table.",
    rootKind: "container",
    category: "page",
    dataMode: "starter",
    keywords: ["page", "full page", "template", "saas", "product", "landing", "pricing", "features"],
    sectionCount: 4,
  },
  {
    id: "print-store",
    label: "Print store",
    description:
      "Full page — Roman-caps display, a product hero gallery, edition details, a buy block, and a related-prints row.",
    rootKind: "container",
    category: "page",
    dataMode: "starter",
    keywords: ["page", "full page", "template", "store", "shop", "ecommerce", "product", "gallery", "pricing"],
    sectionCount: 6,
  },
  {
    id: "live-event",
    label: "Live event",
    description:
      "Full page — a characterful display masthead, a poster hero, a lineup grid, a set-times schedule, and a ticket CTA.",
    rootKind: "container",
    category: "page",
    dataMode: "starter",
    keywords: ["page", "full page", "template", "event", "festival", "lineup", "schedule", "tickets", "music"],
    sectionCount: 6,
  },
  {
    id: "marquee-ticker",
    label: "Disciplines marquee",
    description:
      "Scrolling Noir & Or ticker of discipline words split by gold slashes — pauses on hover, static under reduced-motion. Every word is editable.",
    rootKind: "container",
    category: "page",
    dataMode: "starter",
    keywords: ["marquee", "ticker", "scroll", "strip", "disciplines", "specialties", "band"],
    sectionCount: 1,
  },
  {
    id: "footer-editorial",
    label: "Editorial footer",
    description:
      "Noir & Or site-shell footer — oversized champagne wordmark + tagline, three nav columns, social row, gold hairline, and a © / EN-ES toggle / Powered by Tulala bottom bar. Every node editable; EN/ES baked in.",
    rootKind: "container",
    category: "page",
    dataMode: "starter",
    keywords: ["footer", "site shell", "nav", "social", "bottom", "wordmark", "links", "tulala"],
    sectionCount: 1,
  },
  {
    id: "featured-faces-board",
    label: "Featured faces board",
    description:
      "Noir & Or roster showcase — split header over an asymmetric 12-col mosaic of 8 editorial face cards (hero + tiles) with champagne indices, name/city captions, hover zoom, and a See-all link. Every node editable; EN/ES baked in.",
    rootKind: "container",
    category: "data",
    dataMode: "starter",
    keywords: ["featured", "faces", "roster", "talent", "mosaic", "grid", "board", "models"],
    sectionCount: 1,
  },
  // NB: ships MANUAL (8 hand-placed cards, no dataBinding). The live-roster
  // binding is a flagged owner option, so dataMode is "starter" not "data-ready".
  {
    id: "testimonials-trio",
    label: "Testimonials trio",
    description:
      "Dark Noir & Or band — champagne eyebrow, Cormorant headline, and three outline quote cards that lift to a gold border on hover. Manual editorial quotes, EN/ES seeded.",
    rootKind: "container",
    category: "trust",
    dataMode: "starter",
    keywords: ["testimonials", "quotes", "reviews", "social proof", "trust", "clients"],
    sectionCount: 1,
  },
  {
    id: "stat-band-editorial",
    label: "By the numbers",
    description:
      "Editorial proof row — four stats split by gold hairlines on the warm ground (no filled card), big Cormorant numbers with italic-champagne accents over tiny uppercase labels. 4-up to 2x2.",
    rootKind: "container",
    category: "trust",
    dataMode: "starter",
    keywords: ["stats", "numbers", "metrics", "proof", "editorial", "hairline", "kpi"],
    sectionCount: 4,
  },
  {
    id: "campaigns-lookbook",
    label: "Campaigns & lookbooks rail",
    description:
      "Horizontal-scroll Noir & Or recent-work rail — six 4:5 campaign cards (brand serif / champagne season caption, gold hairline) under a 60-40 section head. Scroll-snap + a 3px gold scrollbar. Every card and caption is editable. Ships manual; live cms_posts binding is a flagged owner option.",
    rootKind: "container",
    category: "story",
    dataMode: "starter",
    keywords: ["campaigns", "lookbook", "rail", "carousel", "portfolio", "recent work", "scroll", "editorial"],
    sectionCount: 1,
  },
  {
    id: "cta-banner-spotlight",
    label: "Leave your imprint CTA",
    description:
      "Full-bleed Noir & Or pre-footer conversion banner — cover portrait under a dark scrim + inset champagne hairline, champagne eyebrow, display 'Leave your imprint.' (imprint. italic champagne), copy, and a dual CTA (gold 'Cast Impronta' to /directory + outline 'Get scouted' to /join). Every node editable; EN/ES baked in.",
    rootKind: "container",
    category: "conversion",
    dataMode: "starter",
    keywords: ["cta", "banner", "conversion", "inquiry", "scout", "imprint", "pre-footer"],
    sectionCount: 1,
  },
  {
    id: "divisions-row",
    label: "Divisions row",
    description:
      "Noir & Or 'Find your cast.' — eyebrow + serif H2 over a full-bleed 5-up row of tall portrait tiles (Women / Men / New Faces / Influence / Events), each a real editorial portrait under a bottom-up scrim with a serif name + champagne index/arrow, hover zoom/colorize, and an invisible full-tile link into /directory. 5 to 3 to 2 column reflow; every node editable; EN/ES baked in.",
    rootKind: "container",
    category: "data",
    dataMode: "starter",
    keywords: ["divisions", "categories", "cast", "roster", "directory", "tiles", "grid", "talent"],
    sectionCount: 1,
  },
  {
    id: "impronta-noir-home",
    label: "Impronta — Noir homepage",
    description:
      "The full Noir & Or homepage as one page — hero slider, disciplines marquee, featured board, divisions, story house, campaigns rail, stats, testimonials, CTA, and footer. Drops the whole design; every section is an editable freeform block.",
    rootKind: "container",
    category: "page",
    dataMode: "starter",
    keywords: ["page", "full page", "template", "impronta", "noir", "homepage", "editorial", "agency"],
    sectionCount: 10,
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
    case "team-grid":
      return createTeamGridPreset();
    case "process-steps":
      return createProcessStepsPreset();
    case "feature-comparison":
      return createFeatureComparisonPreset();
    case "announcement-bar":
      return createAnnouncementBarPreset();
    case "editorial-portfolio":
      return createEditorialPortfolioPreset();
    case "production-agency":
      return createProductionAgencyPreset();
    case "saas-product":
      return createSaasProductPreset();
    case "print-store":
      return createPrintStorePreset();
    case "live-event":
      return createLiveEventPreset();
    case "marquee-ticker":
      return createMarqueeTickerPreset();
    case "footer-editorial":
      return createFooterEditorialPreset();
    case "featured-faces-board":
      return createFeaturedFacesBoardPreset();
    case "testimonials-trio":
      return createTestimonialsTrioPreset();
    case "stat-band-editorial":
      return createStatBandEditorialPreset();
    case "campaigns-lookbook":
      return createCampaignsLookbookRailPreset();
    case "cta-banner-spotlight":
      return createCtaBannerSpotlightPreset();
    case "divisions-row":
      return createDivisionsRowPreset();
    case "impronta-noir-home":
      return createImprontaNoirHomePreset();
  }
}
