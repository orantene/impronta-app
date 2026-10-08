/**
 * Which language an AUTH page (`/login`, `/register`, `/onboarding/*`) renders.
 *
 * WHY this exists: those pages read the `locale` cookie and fall back to the
 * platform default. A fresh visitor never chose a language, but the public
 * pages stamp `locale=en` on them anyway (marked `locale_auto=1`, see
 * `@/i18n/locale-cookies`). A Spanish speaker in Mexico therefore met an
 * English sign-in with no way to know why (TUL-117, C1-02).
 *
 * The rule, in order:
 *   1. A DELIBERATE cookie (present, not auto-written) always wins.
 *   2. Otherwise a Spanish signal (an `es-*` browser language or a Mexico
 *      country code, the same inputs the `/start` flow uses via
 *      `defaultFlowLocale`) picks Spanish, when Spanish is enabled here.
 *   3. Otherwise the auto cookie, then the ambient default, as before.
 *
 * Pure: no `next/*` imports, so the proxy and unit tests share it.
 */

import { defaultFlowLocale } from "@/lib/onboarding/flow";

export type AuthPageLocaleInput = {
  /** The `locale` cookie, already validated against the enabled locales (null when absent/invalid). */
  cookieLocale: string | null;
  /** True when `locale_auto=1` marks the cookie as machine-written. */
  cookieIsAuto: boolean;
  acceptLanguage: string | null | undefined;
  /** `x-vercel-ip-country`. */
  country: string | null | undefined;
  /** Locale used when no signal says otherwise (the pre-change default). */
  fallback: string;
  /** Locales that may be served on this host. */
  enabledLocales: readonly string[];
};

export function resolveAuthPageLocale(input: AuthPageLocaleInput): string {
  if (input.cookieLocale && !input.cookieIsAuto) return input.cookieLocale;
  const detected = defaultFlowLocale({
    saved: null,
    acceptLanguage: input.acceptLanguage,
    country: input.country,
  });
  if (detected === "es" && input.enabledLocales.includes("es")) return "es";
  return input.cookieLocale ?? input.fallback;
}
