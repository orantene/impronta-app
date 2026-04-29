import { unstable_cache } from "next/cache";

import { createPublicSupabaseClient } from "@/lib/supabase/public";
import type { Locale } from "@/i18n/config";
import { withLocalePath } from "@/i18n/pathnames";
import { getPublicTenantScope } from "@/lib/saas/scope";
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
 */
export function resolvePublicCmsNavHref(href: string, locale: Locale): string {
  const raw = href.trim();
  if (!raw) return "/";
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  return withLocalePath(path, locale);
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
        console.warn("[cms/public-navigation] load failed", {
          tenantId,
          locale,
          zone,
          error: error.message,
        });
        return [];
      }
      return (data ?? []) as unknown as RawNavRow[];
    },
    ["cms:public-navigation", tenantId, locale, zone],
    { tags: [tagFor(tenantId, "navigation")] },
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

  return rows.map((r) => ({
    label: r.label,
    href: resolvePublicCmsNavHref(r.href, locale),
    sort_order: r.sort_order,
  }));
}
