/**
 * Legacy `/discover` → `/directory` (TUL-518 S2). Pure so en+es locale
 * preservation is unit-tested without a request.
 */
import { withLocaleHref } from "@/i18n/pathnames";
import { FALLBACK_LANGUAGE_SETTINGS } from "@/lib/language-settings/fetch-language-settings";

/** Collapse `es-MX` → `es` so the prefix matches `publicLocales`. */
function publicLocaleForPath(locale: string): string {
  const lower = locale.toLowerCase();
  const match = FALLBACK_LANGUAGE_SETTINGS.publicLocales.find(
    (code) => lower === code || lower.startsWith(`${code}-`),
  );
  return match ?? FALLBACK_LANGUAGE_SETTINGS.defaultLocale;
}

export function discoverDirectoryRedirectPath(locale: string): string {
  return withLocaleHref("/directory", publicLocaleForPath(locale));
}
