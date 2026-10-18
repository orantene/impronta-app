import { searchBusinessTypes, type BusinessFamilyId } from "@/lib/words/business-types";

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
  const whole = GENERIC_INDUSTRY_WORDS.has(industry.trim().toLowerCase()) ? undefined : searchBusinessTypes(industry)[0];
  if (whole) return { id: whole.id, family: whole.family };
  const words = industry.split(/[^\p{L}]+/u).filter((w) => w.length >= 4 && !GENERIC_INDUSTRY_WORDS.has(w.toLowerCase())).sort((a, b) => b.length - a.length);
  for (const w of words) {
    const hit = searchBusinessTypes(w)[0];
    if (hit) return { id: hit.id, family: hit.family };
  }
  return null;
}
