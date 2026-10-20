/**
 * Light (payload-free) card facts of every collection Design: slug, name and English summary.
 * Client code (gallery, setup, slug checks) reads these instead of `COLLECTION_DESIGNS`, so the
 * payload builders (section kit, per-design trees) stay server-side and out of the admin bundle.
 * `designs.ts` builds its entries from this list; a test pins that they agree.
 */
export type CollectionDesignCard = { readonly slug: string; readonly title: string; readonly summary: string };

export const COLLECTION_DESIGN_CARDS: readonly CollectionDesignCard[] = [
  { slug: "maison-v2", title: "Maison v2", summary: "Split hero, recent work first, an image-led menu and a soft visit band. The next version of Maison." },
  { slug: "solace", title: "Solace", summary: "Calm and spacious: a full-bleed cover, a short intro and services in one unhurried column." },
  { slug: "mono", title: "Mono", summary: "One statement and a fast price list. Built for clients who already know what they want." },
  { slug: "frame", title: "Frame", summary: "Your work first: a portrait split hero, a dense work grid, then services as cards." },
  { slug: "folio", title: "Folio", summary: "Magazine cover with your name as the masthead, a staggered book of work and a rate card." },
  { slug: "gridline", title: "Gridline", summary: "A utility bar with a tap-to-call button, a spec-block hero, a task picker and a clear comparison of services. Built for trades that get called." },
];

export const COLLECTION_DESIGN_SLUGS: ReadonlySet<string> = new Set(COLLECTION_DESIGN_CARDS.map((c) => c.slug));

export function isCollectionDesignSlug(slug: string): boolean {
  return COLLECTION_DESIGN_SLUGS.has(slug.trim().toLowerCase());
}

export function collectionDesignCard(slug: string): CollectionDesignCard | undefined {
  return COLLECTION_DESIGN_CARDS.find((c) => c.slug === slug);
}
