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

export type CardKitSlug =
  | "classic"
  | "editorial-noir"
  | "magazine"
  | "minimal-portrait"
  | "editorial-bridal"
  | "service-professional";

export type CardKit = {
  slug: CardKitSlug;
  label: string;
  description: string;
  /** Registry token key → value. A subset; every kit sets the same keys so
   *  switching kits fully repaints (no stale color bleeds through). */
  tokens: Record<string, string>;
};

export const CARD_KITS: Record<CardKitSlug, CardKit> = {
  classic: {
    slug: "classic",
    label: "Classic",
    description:
      "The platform's clean base card. No color pins — every card inherits your theme, exactly as a fresh workspace starts.",
    tokens: {
      "template.directory-card-family": "classic",
      // Empty = clear the pin and inherit the theme (hex-or-empty validators
      // accept ""). This makes Classic the true "reset to default" kit.
      "card.surface": "",
      "card.name-color": "",
      "card.muted": "",
      "card.price-color": "",
    },
  },
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
      "card.price-color": "#c8a04a",
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
      "card.price-color": "#8a6d2f",
    },
  },
  "editorial-bridal": {
    slug: "editorial-bridal",
    label: "Editorial Bridal",
    description:
      "Soft raised cards on a warm ground with a gentle lift on hover — an atelier lookbook register.",
    tokens: {
      "template.directory-card-family": "editorial-bridal",
      "card.surface": "#faf7f2",
      "card.name-color": "#221c17",
      "card.muted": "#7a7068",
      "card.price-color": "#8a6d2f",
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
      "card.price-color": "#3f3f46",
    },
  },
  "service-professional": {
    slug: "service-professional",
    label: "Service Pro",
    description:
      "Square portraits with roomier text — built for service professionals, studios and crews.",
    tokens: {
      "template.directory-card-family": "service-professional",
      "card.surface": "#ffffff",
      "card.name-color": "#1c1c1c",
      "card.muted": "#6f6f6f",
      "card.price-color": "#2f5d50",
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
