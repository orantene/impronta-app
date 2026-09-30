/**
 * The hero proof line (release 2.5, HE-3): one quiet line under the hero
 * buttons that says, from the talent's own profile, why to trust her.
 *
 *   "9 years of craft · Español · English · ★ 4.9 · 212 reviews"
 *
 * Every part is optional and simply drops out when its data is missing, so a
 * new profile gets a shorter line, never a placeholder. Rating and review
 * count appear together and only when there is at least one review. A demo
 * talent's reviews read "demo reviews" (the same rule as the reviews block:
 * demo content is never passed off as real). Pure; both locales come from one
 * function so the English seed and its Spanish render-time swap cannot drift.
 */

export interface HeroProofInput {
  /** `years_experience`, whole years. 0 / null drops the part. */
  years?: number | null;
  /** Language names as stored ("Spanish", "English"); shown as the languages' own names. */
  languages?: ReadonlyArray<string>;
  /** `rating_avg` (0..5) and `rating_count`; shown only when the count is at least 1. */
  rating?: number | null;
  count?: number | null;
  /** Demo talents: the reviews line says "demo". */
  demo?: boolean;
}

export type ProofLocale = "en" | "es";

/** A language's own name; unknown names pass through as stored. */
const ENDONYM: Readonly<Record<string, string>> = {
  spanish: "Español",
  english: "English",
  french: "Français",
  portuguese: "Português",
  german: "Deutsch",
  italian: "Italiano",
  catalan: "Català",
  dutch: "Nederlands",
  mayan: "Maya",
  yucatec: "Maaya t'aan",
};

export function languageEndonym(name: string): string {
  const n = name.trim();
  return ENDONYM[n.toLowerCase()] ?? n;
}

function yearsPart(years: number, locale: ProofLocale): string {
  if (locale === "es") return years === 1 ? "1 año de oficio" : `${years} años de oficio`;
  return years === 1 ? "1 year of craft" : `${years} years of craft`;
}

function reviewsPart(count: number, demo: boolean, locale: ProofLocale): string {
  if (locale === "es") {
    const noun = count === 1 ? "reseña" : "reseñas";
    return demo ? `${count} ${noun} de demo` : `${count} ${noun}`;
  }
  const noun = count === 1 ? "review" : "reviews";
  return demo ? `${count} demo ${noun}` : `${count} ${noun}`;
}

/** "" when nothing is known (the paragraph then prunes itself). */
export function formatHeroProofLine(input: HeroProofInput, locale: ProofLocale = "en"): string {
  const parts: string[] = [];
  const years = typeof input.years === "number" && Number.isFinite(input.years) ? Math.floor(input.years) : 0;
  if (years >= 1) parts.push(yearsPart(years, locale));
  const seen = new Set<string>();
  for (const raw of input.languages ?? []) {
    const name = languageEndonym(raw);
    if (name && !seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase());
      parts.push(name);
    }
  }
  const count = typeof input.count === "number" && Number.isFinite(input.count) ? Math.floor(input.count) : 0;
  const rating = typeof input.rating === "number" && Number.isFinite(input.rating) ? input.rating : 0;
  if (count >= 1 && rating > 0) {
    parts.push(`★ ${(Math.round(rating * 10) / 10).toFixed(1)}`);
    parts.push(reviewsPart(count, input.demo === true, locale));
  }
  return parts.join(" · ");
}

/** The hero eyebrow, "Nail Artist · Mérida": trade and city, whichever exist. */
export function formatHeroEyebrow(tradeLabel: string | null | undefined, city: string | null | undefined): string {
  return [tradeLabel?.trim(), city?.trim()].filter(Boolean).join(" · ");
}
