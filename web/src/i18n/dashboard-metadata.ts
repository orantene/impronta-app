import type { Metadata } from "next";

import { platformBrandTagline } from "@/lib/brand/platform-brand-locale";
import { TULALA_BRAND } from "@/lib/brand/tulala";
import { getRequestLocale } from "@/i18n/request-locale";

/** Browser-tab title for dashboard pages, in the dashboard language. */
export function dashboardTabTitle(locale: string): string {
  return `${TULALA_BRAND.name} · ${platformBrandTagline(locale)}`;
}

/**
 * Metadata for /talent/* and the workspace admin. The root default is the
 * English brand line, which put an English tab title on Spanish dashboards.
 */
export async function dashboardMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  return { title: { absolute: dashboardTabTitle(locale) } };
}
