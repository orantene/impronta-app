import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";
import { withLocalePath, type LocaleUrlSettings } from "@/i18n/pathnames";

import { counterpartSlug, resolveMissingPage } from "./public-page-fallback";

/**
 * The URL to send a visitor to when the requested published page is missing
 * but the same page exists under the other slug or locale; null otherwise.
 */
export async function missingPageRedirect(
  supabase: SupabaseClient,
  input: { tenantId: string; locale: string; slug: string; settings: LocaleUrlSettings; pathPrefix?: string },
): Promise<string | null> {
  const other = counterpartSlug(input.slug);
  const { data, error } = await supabase
    .rpc("cms_public_pages_for_tenant", { p_tenant_id: input.tenantId })
    .select("locale,slug")
    .in("slug", other ? [input.slug, other] : [input.slug]);
  if (error) {
    logServerError("publicPage.missingRedirect", error);
    return null;
  }
  const hit = resolveMissingPage((data ?? []) as Array<{ locale: string; slug: string }>, input.locale, input.slug);
  if (!hit) return null;
  return `${input.pathPrefix ?? ""}${withLocalePath(`/${hit.slug}`, hit.locale, input.settings)}`;
}
