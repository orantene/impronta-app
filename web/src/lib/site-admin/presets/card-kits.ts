/**
 * Card kits — one-click talent-card looks (P2).
 *
 * A kit is a NAMED SUBSET of card-family token keys (NOT a full theme), so
 * picking "Editorial Noir" repaints the cards without stomping the tenant's
 * page canvas, fonts, or accent. Applied through the SAME design lifecycle as
 * any token edit (saveDesignDraft → publishDesign): the kit's tokens are
 * merged into `agency_branding.theme_json`, validated against the registry,
 * and one publish syncs every card surface via the token cascade.
 *
 * Framework-free + no server-only: imported by the admin client (preview +
 * picker) and the server action alike. Every key/value here MUST be a real,
 * agency-configurable registry token with a valid value — the card-kits test
 * enforces that via the registry's own validateThemePatch.
 */

export type CardKitSlug = "editorial-noir" | "magazine" | "minimal-portrait";

export type CardKit = {
  slug: CardKitSlug;
  label: string;
  description: string;
  /** Registry token key → value. A subset; every kit sets the same keys so
   *  switching kits fully repaints (no stale color bleeds through). */
  tokens: Record<string, string>;
};

export const CARD_KITS: Record<CardKitSlug, CardKit> = {
  "editorial-noir": {
    slug: "editorial-noir",
    label: "Editorial Noir",
    description:
      "Dark cinematic portrait cards — Impronta's house look. Black ground, warm off-white name, hairline restraint.",
    tokens: {
      "template.directory-card-family": "editorial-noir",
      "card.surface": "#0f0f0f",
      "card.name-color": "#f4f1ea",
      "card.muted": "#8a8478",
    },
  },
  magazine: {
    slug: "magazine",
    label: "Magazine",
    description:
      "Light editorial cards on a warm paper ground with ink-black names — a print-spread feel.",
    tokens: {
      "template.directory-card-family": "magazine",
      "card.surface": "#f4f1ea",
      "card.name-color": "#171717",
      "card.muted": "#6b6b6b",
    },
  },
  "minimal-portrait": {
    slug: "minimal-portrait",
    label: "Minimal",
    description:
      "Quiet white cards, neutral type — lets the portrait carry the page.",
    tokens: {
      "template.directory-card-family": "minimal-portrait",
      "card.surface": "#ffffff",
      "card.name-color": "#171717",
      "card.muted": "#8a8a8a",
    },
  },
};

export const CARD_KIT_SLUGS = Object.keys(CARD_KITS) as CardKitSlug[];

export function getCardKit(slug: string): CardKit | null {
  return (CARD_KITS as Record<string, CardKit>)[slug] ?? null;
}

export function listCardKits(): ReadonlyArray<CardKit> {
  return CARD_KIT_SLUGS.map((s) => CARD_KITS[s]);
}
