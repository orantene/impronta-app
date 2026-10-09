/**
 * TUL-349 · one deterministic trade for the talent hero tag and the hero stock photo.
 *
 * Bug: a house cleaner's site got "3D designer" and a chef photo, then
 * "Airbnb cleaning" on a rerun. The stated work text was matched loosely, a weak
 * or unrelated term could win, and the stock pick treated ANY photo outside the
 * query's type as "universal".
 *
 * Pure. `classifyTrade` maps the person's words to a trade key through a fixed
 * keyword table (same text, same key). `resolveTradeType` accepts a catalogue
 * proposal only when it does not contradict that trade; with no confident trade
 * it returns the neutral label instead of guessing.
 */

import { fold, proposeTalentType, type TalentTypeTerm } from "./type-chip";

export type TradeKey = "cleaning" | "chef" | "makeup" | "hair" | "nails" | "design_3d" | "photography" | "music" | "fitness";

type TradeRule = { key: TradeKey; /** Catalogue type id for the stock pack, when one exists. */ businessType: string | null; words: readonly string[] };

/** Order is the tie-break: the first rule with a hit wins. */
const TRADE_RULES: readonly TradeRule[] = [
  { key: "cleaning", businessType: "house-cleaner", words: ["clean", "limpieza", "limpiador", "limpiadora", "maid", "housekeep", "janitor", "aseo", "domestica"] },
  { key: "chef", businessType: null, words: ["chef", "cocinero", "cocinera", "cook", "catering", "baker", "panadero", "reposter"] },
  { key: "makeup", businessType: "makeup-artist", words: ["makeup", "make up", "maquillaj", "maquillador"] },
  { key: "nails", businessType: null, words: ["nail", "manicur", "unas"] },
  { key: "hair", businessType: null, words: ["hair", "barber", "peluquer", "estilista", "colorist"] },
  { key: "design_3d", businessType: null, words: ["3d", "render"] },
  { key: "photography", businessType: null, words: ["photograph", "fotograf", "videograph", "videograf"] },
  { key: "music", businessType: null, words: ["dj", "musician", "musico", "singer", "cantante", "band"] },
  { key: "fitness", businessType: null, words: ["trainer", "yoga", "pilates", "fitness", "entrenador", "coach"] },
];

/** A word of 3 chars or fewer must be a whole word ("dj", "3d"); longer ones match as a word prefix. */
function hasWord(padded: string, w: string): boolean {
  return w.length <= 3 ? padded.includes(` ${w} `) : padded.includes(` ${w}`);
}

/** The trade the words name, or null when none is recognised (never a guess). */
export function classifyTrade(text: string | null | undefined): TradeKey | null {
  const t = fold(text ?? "").replace(/[^a-z0-9]+/g, " ").trim();
  if (!t) return null;
  const padded = ` ${t} `;
  for (const rule of TRADE_RULES) {
    if (rule.words.some((w) => hasWord(padded, w))) return rule.key;
  }
  return null;
}

/** Catalogue type id of the stock pack for a trade (null: no dedicated pack). */
export function stockTypeForTrade(key: TradeKey | null): string | null {
  return TRADE_RULES.find((r) => r.key === key)?.businessType ?? null;
}

export const NEUTRAL_TRADE_LABEL = { en: "Independent professional", es: "Profesional independiente" } as const;

export type TradeResolution =
  | { confident: true; slug: string; label: { en: string; es: string }; trade: TradeKey | null }
  | { confident: false; slug: null; label: typeof NEUTRAL_TRADE_LABEL; trade: TradeKey | null };

/**
 * The talent type to write and show. A tapped chip slug is the person's choice
 * and wins. Otherwise the catalogue proposal for the stated work is used only
 * if its own trade does not contradict the trade the words name.
 */
export function resolveTradeType(input: { typeSlug: string | null; discipline: string | null; terms: readonly TalentTypeTerm[] }): TradeResolution {
  const trade = classifyTrade(input.discipline);
  const chosen = input.typeSlug ? input.terms.find((t) => t.slug === input.typeSlug) : undefined;
  if (chosen) return { confident: true, slug: chosen.slug, label: chosen.name, trade: classifyTrade(`${chosen.name.en} ${chosen.slug}`) ?? trade };

  const discipline = input.discipline?.trim();
  if (discipline) {
    const proposal = proposeTalentType(discipline, input.terms);
    // The best proposal, then (only when a trade is named) the alternatives, in their fixed order.
    const options = trade ? [proposal.proposed, ...proposal.alternatives] : [proposal.proposed];
    for (const o of options) {
      if (!o) continue;
      const termTrade = classifyTrade(`${o.label.en} ${o.slug}`);
      if (trade && termTrade !== trade) continue;
      return { confident: true, slug: o.slug, label: o.label, trade: termTrade ?? trade };
    }
  }
  return { confident: false, slug: null, label: NEUTRAL_TRADE_LABEL, trade };
}
