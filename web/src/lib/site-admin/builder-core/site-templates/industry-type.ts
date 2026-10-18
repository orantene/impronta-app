import { proposeBusinessType } from "@/lib/onboarding/type-chip";
import { businessTypeById, searchBusinessTypes, type BusinessFamilyId } from "@/lib/words/business-types";

/**
 * Words that name a KIND of place, not a business ("studio" is a boxing studio,
 * a hair studio and a photo studio). TUL-1248: the longest-word fallback let
 * "hair studio" land on `boxing-studio` (alphabetical tie on "studio").
 */
const GENERIC_INDUSTRY_WORDS: ReadonlySet<string> = new Set([
  "studio", "studios", "estudio", "estudios", "business", "negocio", "shop", "tienda",
  "service", "services", "servicio", "servicios", "company", "empresa", "center", "centre", "centro",
]);

export function businessTypeFromIndustry(industry: string): { id: string; family: BusinessFamilyId } | null {
  // A bare generic word ("studio") names no business: no search, no chip proposal.
  if (GENERIC_INDUSTRY_WORDS.has(industry.trim().toLowerCase())) return null;
  const whole = searchBusinessTypes(industry)[0];
  if (whole) return { id: whole.id, family: whole.family };
  // #3996 (TUL-591): the /start chip rule, tried before the raw longest-word loop.
  const proposed = proposeBusinessType(industry).proposed;
  if (proposed) {
    const row = businessTypeById(proposed.id);
    if (row) return { id: row.id, family: row.family };
  }
  // TUL-1248: last resort, longest word that is not a generic place word.
  const words = industry.split(/[^\p{L}]+/u).filter((w) => w.length >= 4 && !GENERIC_INDUSTRY_WORDS.has(w.toLowerCase())).sort((a, b) => b.length - a.length);
  for (const w of words) {
    const hit = searchBusinessTypes(w)[0];
    if (hit) return { id: hit.id, family: hit.family };
  }
  return null;
}
