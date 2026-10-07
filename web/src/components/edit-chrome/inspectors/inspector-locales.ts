/**
 * TUL-52 C: the inspector must edit the locale the canvas is showing. The
 * canvas resolves text through the active content locale + fallback chain, so
 * it can show an overlay locale that the tenant's `availableLocales` list
 * omits. Without folding the active locale in, the inspector fell back to the
 * default-locale field (EN) while the canvas showed ES.
 */
export function inspectorLocales(
  availableLocales: readonly string[],
  defaultLocale: string,
  activeContentLocale: string,
): string[] {
  const base = availableLocales.length > 0 ? [...availableLocales] : [defaultLocale];
  if (activeContentLocale && !base.includes(activeContentLocale)) base.push(activeContentLocale);
  return base;
}
