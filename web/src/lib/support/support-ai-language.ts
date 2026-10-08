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

export function supportAiLanguageDirective(
  locale: string | null | undefined,
): string {
  const lang = supportAiLanguageName(locale);
  return `Always answer in the same language as the requester's latest message. If that is unclear, answer in ${lang}. Never reply in English to a Spanish message.`;
}
