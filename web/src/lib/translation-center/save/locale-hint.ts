/**
 * Lightweight, dependency-free hint for save-time validation and integrity flags.
 * Not a substitute for a full CLD; tuned for short UI/bio strings.
 */
export type LocaleHint = "en" | "es" | "mixed" | "unknown";

const ES_WORDS =
  /\b(el|la|los|las|un|una|unos|unas|y|o|pero|porque|que|con|sin|para|por|sobre|entre|más|muy|también|años|año|días|día|esta|este|estos|estas|español|ubicación|experiencia|habilidades)\b/gi;
const EN_WORDS =
  /\b(the|and|with|from|years|year|days|day|this|that|these|those|experience|skills|location|english|model|actor|available)\b/gi;

export function detectLocaleHint(text: string): LocaleHint {
  const t = text.trim();
  if (t.length < 8) return "unknown";
  const esHits = (t.match(ES_WORDS) ?? []).length;
  const enHits = (t.match(EN_WORDS) ?? []).length;
  const words = t.split(/\s+/).filter(Boolean).length;
  if (words < 3) return "unknown";
  if (esHits >= 2 && enHits === 0) return "es";
  if (enHits >= 2 && esHits === 0) return "en";
  if (esHits >= 1 && enHits >= 1) return "mixed";
  return "unknown";
}
