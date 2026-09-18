/**
 * humaniseFieldToken — public-profile display of raw catalog enum tokens.
 *
 * Catalog options are stored as tokens (`available_now`, `she_her`,
 * `highly_experienced`) and only some carry option labels, so without this
 * the public page printed the storage key. Curated EN/ES for the tokens seen
 * on live profiles; anything else in pure snake_case becomes a sentence-cased
 * phrase. Values with spaces, capitals or punctuation are left untouched.
 */
import { pickLocale } from "@/lib/i18n/pick-locale";

const HUMANISED_TOKENS: Record<string, { en: string; es: string }> = {
  available_now: { en: "Available now", es: "Disponible ahora" },
  available_this_week: { en: "Available this week", es: "Disponible esta semana" },
  available_this_month: { en: "Available this month", es: "Disponible este mes" },
  limited: { en: "Limited availability", es: "Disponibilidad limitada" },
  by_request: { en: "By request", es: "Bajo pedido" },
  unavailable: { en: "Unavailable", es: "No disponible" },
  beginner: { en: "Beginner", es: "Principiante" },
  intermediate: { en: "Intermediate", es: "Intermedio" },
  experienced: { en: "Experienced", es: "Con experiencia" },
  professional: { en: "Professional", es: "Profesional" },
  highly_experienced: { en: "Highly experienced", es: "Muy experimentado" },
  national: { en: "National", es: "Nacional" },
  international: { en: "International", es: "Internacional" },
  local: { en: "Local", es: "Local" },
  regional: { en: "Regional", es: "Regional" },
};
const PRONOUN_TOKENS: Record<string, string> = {
  she_her: "she/her",
  he_him: "he/him",
  they_them: "they/them",
  she_they: "she/they",
  he_they: "he/they",
};
export function humaniseFieldToken(value: string, locale: string, fieldKey?: string): string {
  const t = value.trim();
  if (!/^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(t) || !t.includes("_")) {
    // Single lowercase words (`professional`, `national`) still deserve the
    // curated label; everything else is already human.
    const single = HUMANISED_TOKENS[t];
    return single ? pickLocale(locale, single) : value;
  }
  if (fieldKey && /pronoun/i.test(fieldKey) && PRONOUN_TOKENS[t]) return PRONOUN_TOKENS[t];
  if (PRONOUN_TOKENS[t]) return PRONOUN_TOKENS[t];
  const curated = HUMANISED_TOKENS[t];
  if (curated) return pickLocale(locale, curated);
  const words = t.replace(/_+/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

