import { improntaLog } from "@/lib/server/structured-log";
import { unstable_cache } from "next/cache";

import { createPublicSupabaseClient } from "@/lib/supabase/public";
import type { Locale } from "@/i18n/config";
import { withLocalePath, type LocaleUrlSettings } from "@/i18n/pathnames";
import { getPublicTenantScope } from "@/lib/saas/scope";
import { getRequestLocaleUrlSettings } from "@/i18n/tenant-url-locale";
import { tagFor } from "@/lib/site-admin/cache-tags";

export type PublicNavLink = {
  label: string;
  href: string;
  sort_order: number;
};

interface RawNavRow {
  label: string;
  href: string;
  sort_order: number;
}

/**
 * Resolve stored href for the public site (locale prefix for internal paths).
 *
 * `settings` MUST be the tenant's URL grammar. Omitting it falls back to the
 * platform grammar, which prefixes the wrong locale on any tenant whose default
 * locale is not the platform default: every nav link would then 308-redirect on
 * click. `getPublicCmsNavigationLinks` supplies it for the live nav.
 */
export function resolvePublicCmsNavHref(
  href: string,
  locale: Locale,
  settings?: LocaleUrlSettings,
): string {
  const raw = href.trim();
  if (!raw) return "/";
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  return withLocalePath(path, locale, settings);
}

/**
 * Cached fetch of the published navigation tree for one tenant + locale + zone.
 *
 * Tagged `tagFor(tenantId, "navigation")` so `publishNavigationAction` busts
 * it. Identity/branding-style cache barrier so storefront renders don't hit
 * Supabase on every request — required to bring this read in line with the
 * other two storefront reads (`loadPublicIdentity`, `loadPublicBranding`).
 *
 * tenantId/locale/zone resolution stays outside the cache barrier so
 * `getPublicTenantScope()` can read request headers; the inner work is the
 * cacheable part.
 */
function loadCachedNavigation(
  tenantId: string,
  locale: Locale,
  zone: "header" | "footer",
): Promise<RawNavRow[]> {
  return unstable_cache(
    async (): Promise<RawNavRow[]> => {
      const supabase = createPublicSupabaseClient();
      if (!supabase) return [];
      const { data, error } = await supabase
        .rpc("cms_public_navigation_for_tenant", { p_tenant_id: tenantId })
        .select("label,href,sort_order")
        .eq("locale", locale)
        .eq("zone", zone)
        .order("sort_order", { ascending: true });
      if (error) {
        void improntaLog("cms_public_navigation.warn", {
          message: "[cms/public-navigation] load failed",
          tenantId,
          locale,
          zone,
          error: error.message,
        });
        return [];
      }
      return (data ?? []) as unknown as RawNavRow[];
    },
    // Cache-key version suffix (`:v2`). Vercel's Data Cache persists across
    // deploys and `revalidateTag` can't cross runtimes, so a nav row inserted
    // directly in the DB (setup scripts, seeds — no `publishNavigationAction`
    // to fire `revalidateTag`) can leave a STALE cached nav pinned indefinitely
    // (observed on improntamodels.com: header stuck on an old 2-item nav while
    // the DB had the full localized menu). Bumping the key orphans every stale
    // entry so the next request refetches fresh. Bump again if this recurs.
    ["cms:public-navigation:v2", tenantId, locale, zone],
    {
      tags: [tagFor(tenantId, "navigation")],
      // Defensive 300s safety-net TTL — Vercel's Data Cache persists
      // across deploys; `revalidateTag` can't cross runtimes. Bounds
      // staleness for cross-runtime / older-cached edge cases. Same
      // pattern as homepage-reads.ts.
      revalidate: 300,
    },
  )();
}

/**
 * Visible CMS navigation rows for a locale + zone (anon RLS, cached).
 *
 * Returns an empty array off-tenant (hub/marketing/app contexts) rather than
 * leak one tenant's links onto another host.
 */
export async function getPublicCmsNavigationLinks(
  locale: Locale,
  zone: "header" | "footer",
): Promise<PublicNavLink[]> {
  const publicScope = await getPublicTenantScope();
  if (!publicScope) return [];

  const rows = await loadCachedNavigation(publicScope.tenantId, locale, zone);
  if (rows.length === 0) return [];

  const settings = await getRequestLocaleUrlSettings();
  return rows.map((r) => ({
    label: r.label,
    href: resolvePublicCmsNavHref(r.href, locale, settings),
    sort_order: r.sort_order,
  }));
}
