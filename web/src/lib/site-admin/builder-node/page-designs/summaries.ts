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
  /**
   * Root-relative URL for a rendered or representative thumbnail image.
   * Absent = the picker falls back to the archetype-tinted gradient + bars.
   */
  thumbnailUrl?: string;
}

export const PAGE_DESIGN_SUMMARIES: ReadonlyArray<PageDesignSummary> = [
  {
    id: "impronta",
    label: "Impronta agency",
    description:
      "A dark editorial agency home with a warm-gold accent, a directory-search hero, a discipline roster, featured talent, markets and inquiry calls to action.",
    archetype: "agency",
    target: "workspace",
    thumbnailUrl: "/marketing/photos/mk-models-runway.jpg",
  },
  {
    id: "editorial",
    label: "Editorial portfolio",
    description:
      "A single-artist photography portfolio with an oversized serif display, an asymmetric full-bleed hero, a selected-series triptych and a dark scroll-reveal statement.",
    archetype: "editorial",
    target: "talent",
    thumbnailUrl: "/marketing/photos/independent-singer-booking.jpg",
  },
  {
    id: "agency",
    label: "Production agency",
    description:
      "A creative production agency homepage with a fashion-masthead serif, a credits marquee, a roster grid and a clear services breakdown.",
    archetype: "agency",
    target: "workspace",
    thumbnailUrl: "/marketing/photos/agency-workspace-builder.jpg",
  },
  {
    id: "saas",
    label: "SaaS product",
    description:
      "A product landing page with a benefit hero, a three-up feature grid, a live console card and a pricing table.",
    archetype: "saas",
    target: "both",
    thumbnailUrl: "/marketing/photos/mk-hero-business.jpg",
  },
  {
    id: "store",
    label: "Print store",
    description:
      "A fine-art print storefront with a Roman-caps display, a product hero gallery, edition details, a price-and-buy block and a related-prints row.",
    archetype: "store",
    target: "talent",
    thumbnailUrl: "/marketing/photos/talent-services-hero.jpg",
  },
  {
    id: "festival",
    label: "Live event",
    description:
      "A cinematic live-event page with a characterful display masthead, a poster hero, a lineup grid, a set-times schedule and a ticket call to action.",
    archetype: "festival",
    target: "both",
    thumbnailUrl: "/marketing/photos/mk-models-party.jpg",
  },
  {
    id: "studio",
    label: "Creative studio",
    description:
      "A warm, light studio brand with a Fraunces statement hero, a what-we-make trio, a selected-work grid, a quote and a calm contact call to action.",
    archetype: "studio",
    target: "workspace",
    thumbnailUrl: "/marketing/photos/service-pros-lifestyle.jpg",
  },
  {
    id: "noir",
    label: "Studio noir",
    description:
      "A dark, dramatic creative studio on a near-black canvas with a warm-gold accent, a large Fraunces statement hero, a cinematic band and a glowing work grid.",
    archetype: "noir",
    target: "workspace",
    thumbnailUrl: "/marketing/photos/mk-hero-perform.jpg",
  },
  {
    id: "restaurant",
    label: "Restaurant & menu",
    description:
      "A contemporary restaurant page with a Playfair Display name over a full-bleed food hero, a kitchen-story split, a hand-set menu with live pricing and a reservation call to action.",
    archetype: "restaurant",
    target: "both",
    thumbnailUrl: "/marketing/photos/mk-hosts-restaurant.jpg",
  },
  {
    id: "conference",
    label: "Event & conference",
    description:
      "A modern conference homepage on a cobalt-indigo canvas with a bold display hero, a speaker grid, a programme schedule and dual ticket calls to action.",
    archetype: "conference",
    target: "both",
    thumbnailUrl: "/marketing/photos/mk-audience-business.jpg",
  },
  {
    id: "coach",
    label: "Personal brand / coach",
    description:
      "A personal-brand page for a coach or consultant with a portrait-first hero, a three-up services grid, a testimonial row and a book-a-call call to action.",
    archetype: "coach",
    target: "talent",
    thumbnailUrl: "/marketing/photos/mk-hero-service.jpg",
  },
];
