import { createPublicSupabaseClient } from "@/lib/supabase/public";
import type { Locale } from "@/i18n/config";
import { withLocalePath } from "@/i18n/pathnames";

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

  const { data, error } = await supabase
    .from("cms_navigation_items")
    .select("label,href,sort_order")
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
