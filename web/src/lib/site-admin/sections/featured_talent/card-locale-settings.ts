/**
 * Tenant URL grammar for talent-card links.
 *
 * A featured-talent card links to `/t/<code>`, which has a REAL per-locale
 * route: `/es/t/<code>` renders `lang="es"` with Spanish chrome. Without the
 * locale prefix a Spanish visitor clicking a card landed on the English
 * profile. The card applies the prefix itself; this supplies the grammar
 * (default locale + published locales) it needs to do so.
 *
 * Lives in its own module rather than inline in `Component.tsx`: that file sits
 * on the 800-line ratchet, and a helper is cheaper to test than a section.
 */
import { localeUrlSettings, type LocaleUrlSettings } from "@/i18n/pathnames";
import { loadTenantLocaleSettings } from "@/lib/site-admin/server/locale-resolver";

/** Cached 60s per tenant by `loadTenantLocaleSettings`. */
export async function loadCardLocaleSettings(
  tenantId: string,
): Promise<LocaleUrlSettings> {
  const tenantLocales = await loadTenantLocaleSettings(tenantId);
  return localeUrlSettings(
    tenantLocales.defaultLocale,
    tenantLocales.supportedLocales,
  );
}
