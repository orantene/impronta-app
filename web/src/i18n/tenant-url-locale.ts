import "server-only";

import { cache } from "react";
import { headers } from "next/headers";

import { localeUrlSettings, type LocaleUrlSettings } from "@/i18n/pathnames";
import { FALLBACK_LANGUAGE_SETTINGS } from "@/lib/language-settings/fetch-language-settings";
import { getLanguageSettingsPublicCached } from "@/lib/language-settings/get-language-settings";
import { TENANT_HEADER_NAME } from "@/lib/saas/scope";
import { loadTenantLocaleSettings } from "@/lib/site-admin/server/locale-resolver";

/**
 * URL grammar for THIS request, resolved from the tenant the proxy scoped it to.
 *
 * Why this exists: `withLocalePath` / `stripLocaleFromPathname` / `withLocaleHref`
 * default to `FALLBACK_LANGUAGE_SETTINGS` (`en` default, `["en","es"]` public).
 * Render-time href builders on a tenant storefront were calling them with no
 * settings, so every nav/footer/CMS link was built with PLATFORM grammar. On a
 * tenant whose `default_locale` is not `en` that grammar is inverted:
 * `withLocalePath("/models", "es")` returns `/es/models` when the correct
 * canonical URL is `/models`, and the proxy then 308s every single link.
 *
 * The proxy sets `x-impronta-tenant-id` on every tenant-scoped request (agency
 * AND hub, including path-based `/w/<slug>` tenants — see proxy.ts), so the
 * header is the cheapest correct source. Off-tenant surfaces (platform apex,
 * marketing, app host) have no tenant row and legitimately use the GLOBAL
 * settings, which is what the no-header branch returns.
 *
 * React-`cache`d, so N components in one render share one resolution. The
 * underlying `loadTenantLocaleSettings` additionally holds a 60s process cache.
 */
export const getRequestLocaleUrlSettings = cache(
  async (): Promise<LocaleUrlSettings> => {
    let tenantId: string | null = null;
    try {
      tenantId = (await headers()).get(TENANT_HEADER_NAME)?.trim() ?? "";
    } catch {
      // No request scope at all (unit render harnesses, static evaluation).
      // Return the compile-time platform grammar WITHOUT touching the network —
      // there is no tenant to resolve and no request whose latency we'd be
      // saving. Any DB read here would turn a pure render test into a live call.
      return localeUrlSettings(
        FALLBACK_LANGUAGE_SETTINGS.defaultLocale,
        FALLBACK_LANGUAGE_SETTINGS.publicLocales,
      );
    }

    if (!tenantId) {
      // Off-tenant (platform apex / marketing / app host): global grammar.
      const global = await getLanguageSettingsPublicCached();
      return localeUrlSettings(global.defaultLocale, global.publicLocales);
    }

    const tenant = await loadTenantLocaleSettings(tenantId);
    return localeUrlSettings(tenant.defaultLocale, tenant.supportedLocales);
  },
);
