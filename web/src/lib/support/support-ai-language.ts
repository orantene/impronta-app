/**
 * Language directive for the signed-in support AI (TUL-120 F-04).
 *
 * The prompt was English-only with no locale input, so a Spanish ticket in a
 * Spanish app got an English reply. The reply follows the requester's latest
 * message; the app locale is the tiebreaker when that message is ambiguous
 * (a name, a number, one word).
 */
const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
};

export function supportAiLanguageName(locale: string | null | undefined): string {
  const base = (locale ?? "en").toLowerCase().split("-")[0] ?? "en";
  return LANGUAGE_NAMES[base] ?? "English";
}

/**
 * TUL-621: the route runs under /api, which carries no locale prefix, so the
 * request locale fell back to English for a Spanish panel. The client now sends
 * the panel locale; it wins when it is a supported language.
 */
export function resolveSupportAiLocale(
  panelLocale: string | null | undefined,
  requestLocale: string | null | undefined,
): string {
  const base = (panelLocale ?? "").toLowerCase().split("-")[0] ?? "";
  if (base in LANGUAGE_NAMES) return base;
  return (requestLocale ?? "en").toLowerCase().split("-")[0] || "en";
}

export function supportAiLanguageDirective(
  locale: string | null | undefined,
): string {
  const lang = supportAiLanguageName(locale);
  if (lang === "English") {
    return "Always answer in the same language as the requester's latest message. If that is unclear, answer in English.";
  }
  return `Reply in ${lang}. That is the language of the app the requester is using, even if the ticket subject or earlier messages are in English. Never reply in English unless the requester explicitly asks for English.`;
}
