/**
 * Spoken-language names in the reader's language. The profile stores the name
 * the talent picked ("Spanish") plus, often, an ISO code; a Spanish page must
 * read "Español · Inglés", not the stored English name. Pure; uses Intl with
 * the stored name as the last resort so nothing is ever invented.
 */

/** Stored names to ISO codes (only used when no code is stored). */
const NAME_TO_CODE: Readonly<Record<string, string>> = {
  spanish: "es",
  espanol: "es",
  english: "en",
  ingles: "en",
  french: "fr",
  frances: "fr",
  portuguese: "pt",
  portugues: "pt",
  german: "de",
  aleman: "de",
  italian: "it",
  italiano: "it",
  catalan: "ca",
  dutch: "nl",
  russian: "ru",
  ruso: "ru",
  mandarin: "zh",
  chinese: "zh",
  japanese: "ja",
  korean: "ko",
  arabic: "ar",
  hebrew: "he",
  hindi: "hi",
  mayan: "yua",
  yucatec: "yua",
};

function fold(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}

function upperFirst(value: string, locale: string): string {
  return value ? value.charAt(0).toLocaleUpperCase(locale) + value.slice(1) : value;
}

/** The language name in `locale` ("es" gives "Inglés" for "English" or code "en"). */
export function localizedLanguageName(
  input: { name?: string | null; code?: string | null },
  locale: string | null | undefined,
): string {
  const name = input.name?.trim() ?? "";
  const lang = (locale ?? "en").trim().toLowerCase().slice(0, 2) || "en";
  const code = (input.code?.trim().toLowerCase() || NAME_TO_CODE[fold(name)] || "").trim();
  if (code) {
    try {
      const label = new Intl.DisplayNames([lang], { type: "language" }).of(code);
      if (label && label.toLowerCase() !== code) return upperFirst(label, lang);
    } catch {
      // Unsupported locale or code: fall through to the stored name.
    }
  }
  return name || input.code?.trim() || "";
}
