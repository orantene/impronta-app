import type { PageDesignArchetype } from "./types";

/**
 * Lightweight, client-safe metadata for the page-design templates.
 *
 * The full PageDesign objects carry the entire BuilderNode trees (~hundreds of
 * nodes each). Client surfaces — the first-run picker — only need the id +
 * display copy to render cards and dispatch the server apply action, so they
 * import THIS instead of `PAGE_DESIGNS` to keep the trees out of the browser
 * bundle. `page-designs.test.ts` asserts these stay in lockstep with the real
 * designs (same ids/labels/descriptions/archetypes).
 */
export interface PageDesignSummary {
  id: string;
  label: string;
  description: string;
  archetype: PageDesignArchetype;
  /**
   * Which builder surface this full-page starter is intended for — drives the
   * Builder Lab's Site Starter Kit split (Talent Starter Kit vs Agency Starter
   * Kit). "both" starters appear in both kits (generic business pages usable by
   * a single talent OR an agency). Single-subject pages (portfolios, personal
   * brands) are "talent"; roster / multi-talent agency homes are "workspace".
   */
  target: "talent" | "workspace" | "both";
}

export const PAGE_DESIGN_SUMMARIES: ReadonlyArray<PageDesignSummary> = [
  {
    id: "impronta",
    label: "Impronta agency",
    description:
      "The Impronta Models flagship home, freeform: a dark editorial models-&-image agency site with a warm-gold accent, a directory-search hero, a discipline roster, featured talent, markets, process, and inquiry CTAs.",
    archetype: "agency",
    target: "workspace",
  },
  {
    id: "editorial",
    label: "Editorial portfolio",
    description:
      "A single-artist photography portfolio: oversized serif display, an asymmetric full-bleed hero, a selected-series triptych, and a dark scroll-reveal statement.",
    archetype: "editorial",
    target: "talent",
  },
  {
    id: "agency",
    label: "Production agency",
    description:
      "A creative production agency homepage: a fashion-masthead serif, a credits marquee, a roster grid, and a clear services breakdown.",
    archetype: "agency",
    target: "workspace",
  },
  {
    id: "saas",
    label: "SaaS product",
    description:
      "A product landing page: a geometric-sans benefit hero, a three-up feature grid, a live console card, and a pricing table.",
    archetype: "saas",
    target: "both",
  },
  {
    id: "store",
    label: "Print store",
    description:
      "A fine-art print storefront: a Roman-caps display, a product hero gallery, edition details, a price-and-buy block, and a related-prints row.",
    archetype: "store",
    target: "talent",
  },
  {
    id: "festival",
    label: "Live event",
    description:
      "A cinematic live-event page: a characterful display masthead, a poster hero, a lineup grid, a set-times schedule, and a ticket call-to-action.",
    archetype: "festival",
    target: "both",
  },
  {
    id: "studio",
    label: "Creative studio",
    description:
      "A warm, light studio brand: a Fraunces statement hero, a what-we-make trio, a selected-work grid, a clay quote, and a calm contact call-to-action.",
    archetype: "studio",
    target: "workspace",
  },
  {
    id: "noir",
    label: "Studio noir",
    description:
      "A dark, dramatic creative studio: a near-black canvas with a warm-gold accent, a huge Fraunces statement hero, a cinematic band, a glowing work grid, and a bold on-the-record statement.",
    archetype: "noir",
    target: "workspace",
  },
  {
    id: "restaurant",
    label: "Restaurant & menu",
    description:
      "A contemporary restaurant landing page: a Playfair Display name over a full-bleed food hero, a two-column kitchen-story split, a hand-set menu with live pricing, and a reservation CTA.",
    archetype: "restaurant",
    target: "both",
  },
  {
    id: "conference",
    label: "Event & conference",
    description:
      "A modern conference homepage: a cobalt/indigo canvas with lime accents, a bold Geist display hero, a speaker grid, a programme schedule, and dual ticket CTAs.",
    archetype: "conference",
    target: "both",
  },
  {
    id: "coach",
    label: "Personal brand / coach",
    description:
      "A personal-brand page for a coach or consultant: a Fraunces portrait-first hero, a three-up services grid, a testimonial repeater, and a book-a-call CTA.",
    archetype: "coach",
    target: "talent",
  },
];
