import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { PLATFORM_BRAND } from "@/lib/platform/brand";

/**
 * Tenant-aware email brand resolution.
 *
 * Templates render with the agency's wordmark + primary domain in the
 * footer when we can resolve them, falling back to the platform brand.
 * Without this, every email shows "Tulala" even in an agency customer's
 * inbox (the gap called out in the spec §0.2).
 *
 * Cached with a short module-level TTL so a multi-recipient fan-out
 * resolves each tenant once. Works in fire-and-forget / cron contexts
 * where React's request-scoped `cache()` has no request to bind to.
 */

export type EmailBrand = {
  wordmark: string;
  accountName: string;
  footerDomain: string;
  homeHref: string;
  /** BCP-47 short code (e.g. "en", "es") — drives <Html lang> + the per-locale
   *  template-override lookup. Sourced from the tenant's default_locale; the
   *  resolvers always populate it, callers default to "en" when absent. */
  locale?: string;
};

function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ?? `https://${PLATFORM_BRAND.domain}`
  ).replace(/\/$/, "");
}

export function platformBrand(): EmailBrand {
  return {
    wordmark: PLATFORM_BRAND.name.toUpperCase(),
    accountName: PLATFORM_BRAND.name,
    footerDomain: PLATFORM_BRAND.domain,
    homeHref: siteUrl(),
    locale: "en",
  };
}

/** Normalize a stored locale to a short BCP-47 code; default "en". */
function normalizeLocale(v: unknown): string {
  const s = typeof v === "string" ? v.trim().toLowerCase().split(/[-_]/)[0] : "";
  return s || "en";
}

const TTL_MS = 60_000;
const _cache = new Map<string, { value: EmailBrand; at: number }>();

export async function resolveTenantBrand(tenantId: string | null): Promise<EmailBrand> {
  if (!tenantId) return platformBrand();

  const hit = _cache.get(tenantId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  const admin = createServiceRoleClient();
  if (!admin) return platformBrand();

  let brand = platformBrand();
  try {
    const [agencyRes, domainRes, identityRes] = await Promise.all([
      admin.from("agencies").select("display_name, slug").eq("id", tenantId).maybeSingle(),
      admin
        .from("agency_domains")
        .select("hostname")
        .eq("tenant_id", tenantId)
        .eq("is_primary", true)
        .maybeSingle(),
      admin
        .from("agency_business_identity")
        .select("default_locale")
        .eq("tenant_id", tenantId)
        .maybeSingle(),
    ]);

    const agency = agencyRes.data as { display_name?: string | null; slug?: string | null } | null;
    const primaryHost = (domainRes.data as { hostname?: string | null } | null)?.hostname ?? null;
    const locale = normalizeLocale(
      (identityRes.data as { default_locale?: string | null } | null)?.default_locale,
    );

    if (agency?.display_name) {
      brand = {
        wordmark: agency.display_name.toUpperCase(),
        accountName: agency.display_name,
        footerDomain: primaryHost ?? PLATFORM_BRAND.domain,
        homeHref: primaryHost ? `https://${primaryHost}` : siteUrl(),
        locale,
      };
    } else {
      brand = { ...brand, locale };
    }
  } catch (err) {
    logServerError(
      "brand/resolve-tenant-brand",
      err instanceof Error ? err : new Error(String(err)),
    );
  }

  _cache.set(tenantId, { value: brand, at: Date.now() });
  return brand;
}

/** Test/admin hook to clear the brand cache. */
export function _clearTenantBrandCache(): void {
  _cache.clear();
}
