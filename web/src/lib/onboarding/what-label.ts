import type { ChipOption } from "./type-chip";

/**
 * TUL-993: "fotógrafa de retratos" must not come back as "Fotógrafo de
 * Retrato". When the type is still the one we proposed from the person's own
 * words, show and save their words (sentence case); the taxonomy id/slug still
 * ride along. A type they picked themselves keeps its catalogue name.
 */
export function whatLabelFor(input: {
  picked: ChipOption | null;
  proposed: ChipOption | null;
  userWords: string | null;
  locale: "en" | "es";
}): string | null {
  const { picked, proposed, userWords, locale } = input;
  if (!picked) return userWords ? sentenceCase(userWords) : null;
  const words = userWords?.trim();
  if (words && proposed && picked.id === proposed.id) return sentenceCase(words);
  return picked.label[locale] || picked.label.en;
}

function sentenceCase(s: string): string {
  const t = s.trim();
  return t ? t.charAt(0).toLocaleUpperCase() + t.slice(1) : t;
}
