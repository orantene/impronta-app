import { createPublicSupabaseClient } from "@/lib/supabase/public";
import type { Locale } from "@/i18n/config";
import { withLocalePath } from "@/i18n/pathnames";
import { getPublicTenantScope } from "@/lib/saas/scope";

export type PublicNavLink = {
  label: string;
  href: string;
  sort_order: number;
};

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
 * Visible CMS navigation rows for a locale + zone (anon RLS).
 */
export async function getPublicCmsNavigationLinks(
  locale: Locale,
  zone: "header" | "footer",
): Promise<PublicNavLink[]> {
  const supabase = createPublicSupabaseClient();
  if (!supabase) return [];

  // CMS navigation is per-tenant. Non-agency contexts (hub/marketing/app)
  // render no tenant-specific nav — return empty rather than leak one
  // tenant's links onto another host.
  const publicScope = await getPublicTenantScope();
  if (!publicScope) return [];

  const { data, error } = await supabase
    .from("cms_navigation_items")
    .select("label,href,sort_order")
    .eq("tenant_id", publicScope.tenantId)
    .eq("locale", locale)
    .eq("zone", zone)
    .eq("visible", true)
    .order("sort_order", { ascending: true });

  if (error || !data?.length) return [];

  return (data as { label: string; href: string; sort_order: number }[]).map((r) => ({
    label: r.label,
    href: resolvePublicCmsNavHref(r.href, locale),
    sort_order: r.sort_order,
  }));
}
