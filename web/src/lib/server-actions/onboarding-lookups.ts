"use server";

/**
 * Lookups behind the onboarding "basics" question: what you do (from the
 * talent taxonomy or the business-type catalogue, never free text by
 * default) and where (the platform's curated cities, with Google predictions
 * behind them). Read-only, guest-safe, rate-limited by the module's gate.
 */

import { fold, type ChipOption } from "@/lib/onboarding/type-chip";
import { loadTalentTypeTerms } from "@/lib/onboarding/type-chip.server";
import { searchCanonicalCities, searchCuratedCitiesGlobal, type CitySuggestion } from "@/lib/location-autocomplete";
import { rankTalentTypeOptions } from "@/lib/onboarding/type-search";
import { dedupeTypeOptionsByLabel } from "@/lib/onboarding/dedupe-type-options";
import { searchBusinessTypes } from "@/lib/words/business-types";

const MAX = 8;

export async function searchOnboardingTypes(input: { query: string; kind: "talent" | "business"; locale?: "en" | "es" }): Promise<ChipOption[]> {
  const q = fold(input.query.trim());
  if (input.kind === "business") {
    return dedupeTypeOptionsByLabel(searchBusinessTypes(q), input.locale ?? "es")
      .slice(0, MAX)
      .map((b) => ({ id: b.id, slug: b.id, label: b.label, preset: b.preset, family: b.family }));
  }
  const terms = await loadTalentTypeTerms();
  const scored = rankTalentTypeOptions(terms, q, input.locale ?? "es");
  return dedupeTypeOptionsByLabel(scored, input.locale ?? "es").slice(0, MAX);
}

export type OnboardingCity = {
  id: string | null;
  slug: string;
  name: { en: string; es: string };
  countryIso2: string;
  subtitle: string | null;
};

function titleFromSlug(slug: string): string {
  return slug.split("-").filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function toCity(c: CitySuggestion): OnboardingCity {
  // A curated row with no display name (seed drift) still has a slug; never show an empty line.
  const en = c.name_en?.trim() || titleFromSlug(c.slug);
  return {
    id: c.id,
    slug: c.slug,
    name: { en, es: c.name_es?.trim() || en },
    countryIso2: c.country_iso2,
    subtitle: c.subtitle ?? c.country_name_en ?? null,
  };
}

/** Curated cities first (the ones the platform knows); Google fills in when fewer than three match. */
export async function searchOnboardingCities(input: { query: string }): Promise<OnboardingCity[]> {
  const q = input.query.trim();
  if (q.length < 2) return [];
  const curated = (await searchCuratedCitiesGlobal(q)).map(toCity);
  if (curated.length >= 3) return curated.slice(0, MAX);
  const seen = new Set(curated.flatMap((c) => [fold(c.name.en), c.slug]));
  const extra: OnboardingCity[] = [];
  // The market is Mexico first; other countries arrive through the same
  // function once the person types the country, handled in a later iteration.
  try {
    for (const c of await searchCanonicalCities({ query: q, countryIso2: "MX", countryNameEn: "Mexico", countryNameEs: "México" })) {
      const key = fold(c.name_en);
      if (seen.has(key) || seen.has(c.slug)) continue;
      seen.add(key);
      seen.add(c.slug);
      extra.push(toCity(c));
    }
  } catch {
    // Google unavailable: curated only.
  }
  return [...curated, ...extra].slice(0, MAX);
}
