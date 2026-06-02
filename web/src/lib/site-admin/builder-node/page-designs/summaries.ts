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
}

export const PAGE_DESIGN_SUMMARIES: ReadonlyArray<PageDesignSummary> = [
  {
    id: "editorial",
    label: "Editorial portfolio",
    description:
      "A single-artist photography portfolio: oversized serif display, an asymmetric full-bleed hero, a selected-series triptych, and a dark scroll-reveal statement.",
    archetype: "editorial",
  },
  {
    id: "agency",
    label: "Production agency",
    description:
      "A creative production agency homepage: a fashion-masthead serif, a credits marquee, a roster grid, and a clear services breakdown.",
    archetype: "agency",
  },
  {
    id: "saas",
    label: "SaaS product",
    description:
      "A product landing page: a geometric-sans benefit hero, a three-up feature grid, a live console card, and a pricing table.",
    archetype: "saas",
  },
  {
    id: "store",
    label: "Print store",
    description:
      "A fine-art print storefront: a Roman-caps display, a product hero gallery, edition details, a price-and-buy block, and a related-prints row.",
    archetype: "store",
  },
  {
    id: "festival",
    label: "Live event",
    description:
      "A cinematic live-event page: a characterful display masthead, a poster hero, a lineup grid, a set-times schedule, and a ticket call-to-action.",
    archetype: "festival",
  },
];
