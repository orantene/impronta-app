/**
 * Whether the login/register CARD shows its own EN | ES switch.
 *
 * The auth layout footer renders `AuthLanguageToggle`, which shows itself only
 * on agency/hub hosts whose tenant locale settings allow a switcher and offer
 * more than one language. On the platform hosts (app, marketing, unknown) the
 * footer toggle is hidden (the platform fallback is a single "en"), so the card
 * carries the switch instead. Exactly one of the two shows: this mirrors the
 * footer's condition and negates it. Pure, so it is unit tested without a request.
 */

export type CardLocaleToggleInput = {
  hostKind: string;
  /** Tenant `supportedLocales`; only read on agency/hub hosts. */
  supportedLocales?: readonly string[] | null;
  /** Tenant `showLanguageSwitcher`; only read on agency/hub hosts. */
  showLanguageSwitcher?: boolean | null;
  /** Tenant `defaultLocale`; counts toward the locale set like the footer does. */
  defaultLocale?: string | null;
};

/** Mirror of the footer toggle's visibility (`AuthLanguageToggle` + layout). */
export function footerLocaleToggleShown(input: CardLocaleToggleInput): boolean {
  if (input.hostKind !== "agency" && input.hostKind !== "hub") return false;
  if (input.showLanguageSwitcher === false) return false;
  const locales = new Set(
    [input.defaultLocale ?? "en", ...(input.supportedLocales ?? [])].filter(Boolean),
  );
  return locales.size > 1;
}

export function showCardLocaleToggle(input: CardLocaleToggleInput): boolean {
  return !footerLocaleToggleShown(input);
}
