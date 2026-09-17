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
import { searchBusinessTypes } from "@/lib/words/business-types";

const MAX = 8;

export async function searchOnboardingTypes(input: { query: string; kind: "talent" | "business" }): Promise<ChipOption[]> {
  const q = fold(input.query.trim());
  if (input.kind === "business") {
    return searchBusinessTypes(q)
      .slice(0, MAX)
      .map((b) => ({ id: b.id, slug: b.id, label: b.label, preset: b.preset, family: b.family }));
  }
  const terms = await loadTalentTypeTerms();
  // Word-level: "nail technician" must find "Nail Artist"; the whole phrase
  // rarely matches a catalogue label, its strongest word usually does.
  const words = q.split(/\s+/).filter((w) => w.length >= 3);
  const scored = terms
    .map((t) => {
      const hay = [t.name.en, t.name.es, ...t.aliases, ...t.synonyms].map(fold);
      if (!q) return { t, score: 1 };
      let score = 0;
      if (hay.some((h) => h === q)) score += 10;
      else if (hay.some((h) => h.startsWith(q))) score += 6;
      else if (hay.some((h) => h.includes(q))) score += 4;
      for (const w of words) if (hay.some((h) => h.split(/[^a-z0-9]+/).includes(w))) score += 2;
      for (const w of words) if (score === 0 && hay.some((h) => h.includes(w))) score += 1;
      // The first word carries the trade ("nail technician" → Nail, not Technician).
      if (words[0] && hay.some((h) => h.split(/[^a-z0-9]+/).includes(words[0]))) score += 1;
      return { t, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.t.name.en.localeCompare(b.t.name.en))
    .slice(0, MAX);
  return scored.map(({ t }) => ({ id: t.id, slug: t.slug, label: t.name }));
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
