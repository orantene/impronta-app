/**
 * TUL-1777: IndexNow ping for a published CMS page of a workspace (`/w/<slug>`) or agency host. Best-effort, prod only
 * (see ./indexnow), debounced per URL, never throws.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { afterResponse } from "@/lib/server/after-response";

import { pingIndexNowUrl } from "./indexnow";
import { resolveTenantPublicOriginForIndexNow } from "./indexnow-tenant-origin";

/** Path of a CMS page under the tenant base. English is the unprefixed default; other locales carry `/<locale>`. */
export function cmsPageIndexNowPath(locale: string, slug: string): string {
  const prefix = locale && locale !== "en" ? `/${locale}` : "";
  const rest = slug.replace(/^\/+|\/+$/g, "");
  return `${prefix}${rest ? `/${rest}` : ""}` || "/";
}

export async function pingIndexNowForCmsPage(
  sb: SupabaseClient,
  tenantId: string,
  page: { locale: string; slug: string },
): Promise<void> {
  const base = await resolveTenantPublicOriginForIndexNow(sb, tenantId);
  if (!base) return;
  const path = cmsPageIndexNowPath(page.locale, page.slug);
  await pingIndexNowUrl(path === "/" ? base : `${base}${path}`);
}

/** Fire-and-forget after the response (best-effort, prod only, debounced); keeps call sites to one line. */
export function queueIndexNowForCmsPage(
  sb: SupabaseClient,
  tenantId: string,
  page: { locale: string; slug: string },
  label: string,
): void {
  afterResponse(() => pingIndexNowForCmsPage(sb, tenantId, page), label);
}
