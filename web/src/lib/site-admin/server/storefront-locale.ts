/**
 * Phase 5 / M1 — storefront locale composer.
 *
 * Single entry point for storefront pages (M5 homepage, M6 design tokens,
 * later: posts, model pages, contact) that need to render in a locale that
 * the current tenant actually supports.
 *
 * Flow:
 *   1. Read the request locale set by middleware (`LOCALE_HEADER`). This is
 *      already one of the platform public locales.
 *   2. Read the active tenant id from the request scope.
 *   3. Load the tenant's locale settings (TTL-cached, edge-safe).
 *   4. Resolve → `{locale, isFallback}`.
 *
 * Middleware already redirects unsupported locale prefixes to the tenant's
 * default, so in practice `isFallback` is only `true` when no tenant row
 * exists yet (first-run tenant) or the DB was briefly unreachable. Callers
 * should still handle the fallback flag — future Site Health work surfaces
 * missing-locale warnings, and render code may want to emit an `hreflang`
 * signal when a fallback renders.
 */

import { getRequestLocale } from "@/i18n/request-locale";
import { getPublicTenantScope } from "@/lib/saas/scope";
import {
  loadTenantLocaleSettings,
  resolveTenantLocale,
  type TenantLocaleSettings,
} from "./locale-resolver";
import type { Locale } from "@/lib/site-admin/locales";

export interface StorefrontLocaleContext {
  /** The locale we actually render for this request. */
  locale: Locale;
  /** The locale the URL asked for (may equal `locale`). */
  requestedLocale: string;
  /** True when `locale !== requestedLocale` — tenant didn't support request. */
  isFallback: boolean;
  /** The tenant locale settings used to resolve. */
  settings: TenantLocaleSettings;
  /** The tenant id this was resolved against, or `null` on non-tenant hosts. */
  tenantId: string | null;
}

/**
 * Resolve the effective rendering locale for the current request on a
 * tenant host. Safe to call from RSC and layouts.
 *
 * On non-tenant hosts (marketing, app, hub) there is no per-tenant locale
 * setting; this returns the platform fallback alongside `tenantId: null`.
 * Callers that only render for tenant hosts can branch on `tenantId`.
 */
export async function resolveStorefrontLocale(): Promise<StorefrontLocaleContext> {
  const requestedLocale = await getRequestLocale();
  const scope = await getPublicTenantScope();
  const tenantId = scope?.tenantId ?? null;

  if (!tenantId) {
    const { locale, isFallback } = resolveTenantLocale(
      { defaultLocale: "en", supportedLocales: ["en"] },
      requestedLocale,
    );
    return {
      locale,
      requestedLocale,
      isFallback,
      settings: { defaultLocale: "en", supportedLocales: ["en"] },
      tenantId: null,
    };
  }

  const settings = await loadTenantLocaleSettings(tenantId);
  const { locale, isFallback } = resolveTenantLocale(settings, requestedLocale);
  return {
    locale,
    requestedLocale,
    isFallback,
    settings,
    tenantId,
  };
}
