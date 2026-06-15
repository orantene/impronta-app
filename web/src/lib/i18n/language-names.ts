// Locale-aware language-name + proficiency labels for talent_languages.
//
// talent_languages stores language_name in English only. This maps the ISO
// language_code to a Spanish name (and localizes the proficiency level + role
// flags) so /es surfaces render "Inglés (conversacional)" instead of
// "English (conversational)". Falls back to the stored English name for any
// code not in the map, so it never blanks out.

/** ISO 639-1 code → Spanish language name. */
const LANGUAGE_NAME_ES: Record<string, string> = {
  en: "Inglés", es: "Español", fr: "Francés", it: "Italiano", pt: "Portugués",
  de: "Alemán", nl: "Neerlandés", ru: "Ruso", ar: "Árabe", zh: "Chino",
  ja: "Japonés", ko: "Coreano", hi: "Hindi", tr: "Turco", he: "Hebreo",
  pl: "Polaco", ro: "Rumano", sv: "Sueco", uk: "Ucraniano", el: "Griego",
  cs: "Checo", da: "Danés", fi: "Finlandés", no: "Noruego", hu: "Húngaro",
  th: "Tailandés", vi: "Vietnamita", id: "Indonesio", ca: "Catalán",
  eu: "Euskera", gl: "Gallego",
};

const SPEAKING_LEVEL_ES: Record<string, string> = {
  basic: "básico",
  conversational: "conversacional",
  professional: "profesional",
  fluent: "fluido",
  native: "nativo",
};

const LANGUAGE_FLAG_ES: Record<string, string> = {
  host: "anfitrión",
  sell: "ventas",
  translate: "traducción",
};

/** Locale-aware language name: ES name when locale=es and known, else the
 *  stored English name. */
export function localizeLanguageName(
  languageCode: string,
  englishName: string,
  locale: string,
): string {
  if (locale === "es") {
    const es = LANGUAGE_NAME_ES[languageCode?.toLowerCase()];
    if (es) return es;
  }
  return englishName;
}

/** Locale-aware proficiency level (native/fluent/…). */
export function localizeSpeakingLevel(level: string, locale: string): string {
  if (locale === "es") return SPEAKING_LEVEL_ES[level] ?? level;
  return level;
}

/** Locale-aware role flag (host/sell/translate). */
export function localizeLanguageFlag(flag: string, locale: string): string {
  if (locale === "es") return LANGUAGE_FLAG_ES[flag] ?? flag;
  return flag;
}
