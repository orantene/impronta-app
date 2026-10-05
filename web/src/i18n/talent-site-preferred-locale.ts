/** A talent vanity host has no locale prefix. Prefer her preferred_locale. */
export function talentSiteShouldUsePreferredLocale(input: {
  hostContext: string | null;
  hasLocalePrefix: boolean;
}): boolean {
  return input.hostContext === "talent_site" && !input.hasLocalePrefix;
}
