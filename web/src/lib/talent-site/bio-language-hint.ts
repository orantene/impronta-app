/**
 * #187: when a visitor's language has no bio and the bio of another language
 * is shown instead, a small neutral line says which language it is in.
 * English visitor seeing Spanish: "Disponible en español". Spanish visitor
 * seeing English: "Disponible en inglés". Same wording for photo captions.
 * Pure; the language names are the platform's own.
 */

type BioMap = Readonly<Record<string, string | null | undefined>> | null | undefined;

/** Spanish language names for the "Disponible en …" hint (TUL-187). */
const NAME_ES: Record<string, string> = {
  en: "inglés",
  es: "español",
  fr: "francés",
  it: "italiano",
  pt: "portugués",
  de: "alemán",
  nl: "neerlandés",
  ru: "ruso",
  ar: "árabe",
  zh: "chino",
  ja: "japonés",
  ko: "coreano",
};

export const ENGLISH_NAME: Record<string, string> = {
  en: "English", es: "Spanish", fr: "French", it: "Italian", pt: "Portuguese",
  de: "German", nl: "Dutch", ru: "Russian", ar: "Arabic", zh: "Chinese",
  ja: "Japanese", ko: "Korean",
};

function key(locale: string | null | undefined): string {
  return (locale ?? "").trim().toLowerCase().slice(0, 2);
}

/**
 * The language the shown bio is actually in when it is NOT the visitor's, else
 * null (visitor language present, or no bio at all). Walks `chain` the same way
 * the bio swap does: visitor, chain, then English.
 */
export function bioFallbackLanguage(
  bioI18n: BioMap,
  locale: string | null | undefined,
  chain: readonly string[] = [],
): string | null {
  const visitor = key(locale);
  if (!visitor) return null;
  if (bioI18n?.[visitor]?.trim()) return null;
  for (const code of [...chain, "en"]) {
    const k = key(code);
    if (k && k !== visitor && bioI18n?.[k]?.trim()) return k;
  }
  return null;
}

/**
 * The hint line for the visitor, or null when none is needed. One style for
 * bio and photo captions (and the lightbox caption): "Disponible en español".
 */
export function bioLanguageHint(
  bioI18n: BioMap,
  locale: string | null | undefined,
  chain: readonly string[] = [],
): string | null {
  const shown = bioFallbackLanguage(bioI18n, locale, chain);
  if (!shown) return null;
  const name = NAME_ES[shown] ?? ENGLISH_NAME[shown]?.toLowerCase() ?? shown;
  return `Disponible en ${name}`;
}
