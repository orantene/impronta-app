/**
 * E-02 / E-14 · the new site's bio in BOTH languages, decided in one place.
 *
 * The site swaps the baked English bio for the visitor's language at render
 * time (`talent-locale-swaps.ts`), and that swap only exists when `bio_i18n`
 * holds an `en` entry next to the other locale. So onboarding drafts English
 * and Spanish from the same facts (one deterministic template each, same
 * rules), keeps every draft that passes `bioPassesRules`, and names one of
 * them the base text (`talent_profiles.short_bio`): the language the person
 * used in the flow. Pure; the writer does the IO.
 */

import { bioPassesRules, draftBio, type BioFacts } from "./draft-bio";

export type BioLocale = "en" | "es";
export type DraftedBio = { locale: BioLocale; text: string };

export type BioPlan = {
  /** Every draft that passed the rules, flow language first. */
  entries: DraftedBio[];
  /** The text for `short_bio`: the flow language when it passed, else the first draft that did. Null when none passed. */
  base: DraftedBio | null;
};

export function planBios(facts: BioFacts, flowLocale: BioLocale): BioPlan {
  const other: BioLocale = flowLocale === "es" ? "en" : "es";
  const entries: DraftedBio[] = [];
  for (const locale of [flowLocale, other] as const) {
    const text = draftBio(facts, locale);
    if (bioPassesRules(text, facts).ok) entries.push({ locale, text });
  }
  return { entries, base: entries.find((e) => e.locale === flowLocale) ?? entries[0] ?? null };
}

/**
 * TUL-442 · locales from a bio plan that must be enabled on the public site
 * (`secondary_locales`) so `/en` is reachable when English bio text exists.
 * Excludes the primary/flow locale; order follows `entries`.
 */
export function secondaryLocalesFromBioEntries(
  entries: readonly DraftedBio[],
  primary: BioLocale,
): BioLocale[] {
  const out: BioLocale[] = [];
  for (const entry of entries) {
    if (entry.locale === primary) continue;
    if (!out.includes(entry.locale)) out.push(entry.locale);
  }
  return out;
}
