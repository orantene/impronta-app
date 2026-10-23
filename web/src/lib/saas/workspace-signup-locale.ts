/**
 * TUL-117 · the language a new workspace is born in.
 *
 * The /start flow knows the language the person built the workspace in. That
 * language becomes the tenant's `default_locale` (the dashboard seed and the
 * unprefixed public URL grammar both follow it), and the tenant supports both
 * platform languages with the flow language first, so the second one is a
 * switch away instead of a settings trip. `agencies.supported_locales` mirrors
 * the same list so the two columns never disagree.
 *
 * Returns null for any locale the flow cannot name (legacy /get-started
 * provisioning, a request locale such as `fr`): the caller then keeps today's
 * behavior, a default-English tenant.
 */

export type WorkspaceFlowLocale = "en" | "es";

export type WorkspaceLocaleSettings = {
  defaultLocale: WorkspaceFlowLocale;
  supportedLocales: WorkspaceFlowLocale[];
};

export function workspaceLocaleSettingsForFlow(
  locale: string | null | undefined,
): WorkspaceLocaleSettings | null {
  if (locale === "es") return { defaultLocale: "es", supportedLocales: ["es", "en"] };
  if (locale === "en") return { defaultLocale: "en", supportedLocales: ["en", "es"] };
  return null;
}

/**
 * TUL-1993: the new workspace's OWN money, decided the same way its own
 * language already is — by the /start flow's chosen locale, never a guessed
 * IP country. This is the same `es` -> MXN convention the rest of the
 * product already applies to a Spanish signal with no country in hand:
 * marketing prices (`pickMarketingCurrency`, TUL-864) and the onboarding
 * essentials flow (`setupCurrency`, TUL-16 b) both start a Spanish flow in
 * pesos instead of a silent USD. The self-serve `/get-started` provisioner
 * (`workspace-signup.server.ts`) had no such read at all: every new
 * `agencies` row left `default_currency` unset and fell through to the
 * column's own DEFAULT 'USD', so an MXN-context (Spanish) signup landed on a
 * USD account. `en`, unset, or any other locale (e.g. `fr`) keeps USD.
 */
export function signupDefaultCurrency(locale: string | null | undefined): "MXN" | "USD" {
  return workspaceLocaleSettingsForFlow(locale)?.defaultLocale === "es" ? "MXN" : "USD";
}
