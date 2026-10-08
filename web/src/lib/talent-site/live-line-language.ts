/**
 * Which language a short line is written in, and which of a talent's stored lines a
 * visitor on the Spanish or English page should read (hero headline and tagline).
 *
 * A talent's lines live in up to three places: a per-language map (`{ es, en }`, the
 * profile editor), the plain field (written in her main language, but sometimes in the
 * other one) and, for the tagline, `short_bio` (the short text of her main language). The
 * choice below never shows English to a Spanish visitor when a Spanish line exists, and a
 * missing language falls back to her main one. Pure.
 */

export type LineLocale = "en" | "es";

const EN_WORDS = /\b(the|and|with|for|your|you|every|just|is|are|in|of|to|a|an|my|no|at|by|on|that|this|made|clean|nails|hair)\b/gi;
const ES_WORDS = /\b(el|la|los|las|un|una|y|con|para|tu|tus|de|del|en|que|por|cada|solo|es|mi|sin|uñas|cabello|donde|hechas?)\b/gi;

/** "es", "en", or null when the text is too short or too mixed to tell. */
export function guessLineLanguage(text: string | null | undefined): LineLocale | null {
  const t = text?.trim();
  if (!t) return null;
  const en = (t.match(EN_WORDS) ?? []).length;
  // Accents and inverted marks lean Spanish, but one place name ("Cancún") must not outvote an English sentence.
  const es = (t.match(ES_WORDS) ?? []).length + (t.match(/[áéíóúñ¿¡]/gi) ?? []).length;
  if (en === es) return null;
  return en > es ? "en" : "es";
}

export interface LocalizedLineInput {
  /** The per-language map from the profile editor. */
  map?: Readonly<Record<string, string>> | null;
  /** The plain field. */
  plain?: string | null;
  /** The short text of her main language (`short_bio`), the tagline's other home. */
  alt?: string | null;
  /** The visitor's language. */
  locale: LineLocale;
  /** The talent's main language. */
  primary: LineLocale;
}

/** The line a visitor reads, "" when the talent wrote none. */
export function resolveLocalizedLine(i: LocalizedLineInput): string {
  const texts = [i.plain, i.alt].map((t) => t?.trim() ?? "").filter(Boolean);
  const inLang = (l: LineLocale) => texts.find((t) => guessLineLanguage(t) === l);
  const unknown = () => texts.find((t) => guessLineLanguage(t) === null);
  const mapped = (l: LineLocale) => i.map?.[l]?.trim() || undefined;
  return (
    mapped(i.locale) ??
    inLang(i.locale) ??
    (i.locale === i.primary ? unknown() : undefined) ??
    mapped(i.primary) ??
    inLang(i.primary) ??
    unknown() ??
    texts[0] ??
    ""
  );
}
