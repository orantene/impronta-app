/**
 * TUL-1372: the directory's empty text. The owner's own text always wins. The two built-in
 * English defaults (the preset and the old fallback) are shown in the page language, so an
 * ES page never prints English for an empty roster.
 */
const ENGLISH_DEFAULTS = new Set([
  "no one matches yet. broaden the filters, or check back as the roster grows.",
  "no one matches yet, check back as the roster grows.",
]);

export function emptyStateCopy(authored: string | undefined | null, locale: string, localizedDefault: string): string {
  const text = (authored ?? "").trim();
  if (!text) return localizedDefault;
  if (!locale.toLowerCase().startsWith("en") && ENGLISH_DEFAULTS.has(text.toLowerCase())) return localizedDefault;
  return text;
}
