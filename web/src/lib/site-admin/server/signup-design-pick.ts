/**
 * Pick which homepage a new signup should land on.
 *
 * SELECT, do not invent: every id here is a `PAGE_DESIGNS` registry entry or
 * the Lab-managed platform default. A freeform tree from the model is how
 * invalid pages reach a live site. This module is the deterministic half of
 * AI-at-signup; copy rewrite lives next to it.
 *
 * Agency signups with no stronger keyword keep the Lab default (Wave 2B).
 * Everyone else gets an audience default so a restaurant does not open on
 * a model-agency kit.
 */

import { PAGE_DESIGNS } from "@/lib/site-admin/builder-node/page-designs";
import type { SignupAudience } from "@/lib/saas/workspace-signup";

export type SignupDesignSource = "page_design" | "platform_default";

export type SignupDesignPick = {
  source: SignupDesignSource;
  /** Set only when `source === "page_design"`. Always a PAGE_DESIGNS id. */
  designId: string | null;
};

const PAGE_DESIGN_ID_SET: ReadonlySet<string> = new Set(
  PAGE_DESIGNS.map((design) => design.id),
);

/**
 * Keyword → design. First match wins. More specific rows sit above broader
 * ones (`restaurant` before `store`, `conference` before a generic event).
 */
const KEYWORD_DESIGNS: ReadonlyArray<{ words: readonly string[]; designId: string }> =
  [
    { words: ["restaurant", "cafe", "café", "bistro", "kitchen", "dining", "bar"], designId: "restaurant" },
    // Salon, barber, spa, clinic had no row, so all four fell through
    // AUDIENCE_DEFAULT.business to `store` — the fine-art print storefront,
    // whose nav said Shop and whose button said "Add to cart, $280" against a
    // fabricated price. A barbershop was handed a shop with a cart in it.
    // Above `shop`/`store` deliberately: "barber shop" contains "shop".
    {
      words: [
        "salon", "barber", "barbershop", "barberia", "barbería",
        "spa", "wellness", "massage", "masaje",
        "clinic", "clinica", "clínica", "dental", "dentist",
        "nails", "beauty", "estetica", "estética", "peluqueria", "peluquería",
      ],
      designId: "services",
    },
    { words: ["shop", "store", "boutique", "retail", "print"], designId: "store" },
    { words: ["festival", "concert", "lineup", "band"], designId: "festival" },
    { words: ["conference", "summit", "congress", "meetup"], designId: "conference" },
    { words: ["saas", "software", "app", "platform"], designId: "saas" },
    { words: ["coach", "coaching", "consultant", "mentor", "speaker"], designId: "coach" },
    { words: ["studio", "photography", "photo", "film", "atelier"], designId: "studio" },
    { words: ["editorial", "portfolio", "photographer", "artist"], designId: "editorial" },
    { words: ["luxury", "noir"], designId: "noir" },
    { words: ["fashion", "model", "casting", "roster"], designId: "agency" },
  ];

/** Audience default when no keyword hits. Agency keeps the Lab pointer. */
const AUDIENCE_DEFAULT: Readonly<Record<SignupAudience, SignupDesignPick>> = {
  agency: { source: "platform_default", designId: null },
  organization: { source: "page_design", designId: "conference" },
  business: { source: "page_design", designId: "store" },
  operator: { source: "page_design", designId: "coach" },
};

function normalizeHaystack(description: string): string {
  return ` ${description.toLowerCase().replace(/[^a-z0-9áéíóúüñ]+/gi, " ")} `;
}

function hasWord(haystack: string, word: string): boolean {
  return haystack.includes(` ${word} `);
}

function assertKnownDesign(designId: string): string {
  if (!PAGE_DESIGN_ID_SET.has(designId)) {
    throw new Error(`signup-design-pick: unknown PAGE_DESIGNS id "${designId}"`);
  }
  return designId;
}

/**
 * Pure. No I/O. `audience` missing → treat as operator (same as the funnel).
 */
export function pickSignupDesign(input: {
  audience?: string | null;
  businessDescription?: string | null;
}): SignupDesignPick {
  const description = input.businessDescription?.trim() ?? "";
  if (description.length > 0) {
    const haystack = normalizeHaystack(description);
    for (const row of KEYWORD_DESIGNS) {
      if (row.words.some((word) => hasWord(haystack, word))) {
        return {
          source: "page_design",
          designId: assertKnownDesign(row.designId),
        };
      }
    }
  }

  const audience = (input.audience ?? "operator").trim().toLowerCase();
  if (audience === "agency") return AUDIENCE_DEFAULT.agency;
  if (audience === "organization") return AUDIENCE_DEFAULT.organization;
  if (audience === "business") return AUDIENCE_DEFAULT.business;
  return AUDIENCE_DEFAULT.operator;
}

/** Test helper: every id this module can emit exists in PAGE_DESIGNS. */
export function signupDesignPickIds(): readonly string[] {
  return KEYWORD_DESIGNS.map((row) => row.designId).concat(
    Object.values(AUDIENCE_DEFAULT)
      .map((pick) => pick.designId)
      .filter((id): id is string => Boolean(id)),
  );
}
