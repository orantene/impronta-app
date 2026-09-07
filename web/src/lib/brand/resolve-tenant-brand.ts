import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { planTierHasWhitelabel } from "@/lib/saas/workspace-public-url";
import {
  TULALA_EMAIL_ACCENT,
  TULALA_EMAIL_ACCENT_ON,
  httpsLogoUrl,
  normalizeBrandHex,
  readableOn,
} from "@/lib/brand/email-palette";

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
  /**
   * Whether the person receiving this mail actually has an account. Set
   * per-recipient by the email channel, not by the brand resolver — the brand
   * is per tenant, this is per reader. Drives the footer's "why you got this"
   * line, which used to claim an account for guests who have none.
   */
  recipientHasAccount?: boolean;
  /**
   * Absolute URL of the tenant's brand logo, rendered in the email header in
   * place of the text wordmark. Sourced from `agency_branding.theme_json
   * .logo_url` — the same public projection the storefront shell and the
   * workspace identity bar already read, so there is no new logo store and no
   * second source of truth. Null keeps the text wordmark.
   *
   * Deliberately NOT `logo_media_asset_id` (needs a media-URL resolver) or
   * `brand_mark_svg` (inline SVG; Gmail strips it, and an email cannot render
   * markup the way `PublicHeader` does).
   */
  logoUrl?: string | null;
  /** Brand colour for buttons and links. Validated hex; never operator text. */
  accent?: string;
  /** Readable foreground for `accent`, contrast-picked, not assumed white. */
  accentOn?: string;
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
    logoUrl: null,
    accent: TULALA_EMAIL_ACCENT,
    accentOn: TULALA_EMAIL_ACCENT_ON,
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
    const [agencyRes, domainRes, identityRes, brandingRes] = await Promise.all([
      admin.from("agencies").select("display_name, slug, plan_tier").eq("id", tenantId).maybeSingle(),
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
      admin
        .from("agency_branding")
        .select("accent_color, primary_color, theme_json")
        .eq("tenant_id", tenantId)
        .maybeSingle(),
    ]);

    const agency = agencyRes.data as {
      display_name?: string | null;
      slug?: string | null;
      plan_tier?: string | null;
    } | null;
    const primaryHost = (domainRes.data as { hostname?: string | null } | null)?.hostname ?? null;
    const locale = normalizeLocale(
      (identityRes.data as { default_locale?: string | null } | null)?.default_locale,
    );

    const brandingRow = brandingRes.data as {
      accent_color?: string | null;
      primary_color?: string | null;
      theme_json?: Record<string, unknown> | null;
    } | null;
    const themeJson = brandingRow?.theme_json ?? {};
    // Same precedence the auth shell already uses: the whitelabel accent column
    // first, then the storefront theme-cascade token, then the primary colour.
    // The middle one matters — it is the entry actually populated for the live
    // whitelabel tenant, so skipping it ships a "branded" email that is never
    // branded.
    const tenantAccent =
      normalizeBrandHex(brandingRow?.accent_color) ??
      normalizeBrandHex(themeJson["color.accent"]) ??
      normalizeBrandHex(brandingRow?.primary_color);
    const tenantLogo = httpsLogoUrl(themeJson["logo_url"]);

    // Agency-branded email only on a whitelabel tier (Agency / Network);
    // otherwise the email stays Tulala-branded (platform default), keeping the
    // resolved locale so the template still renders in the tenant's language.
    if (agency?.display_name && planTierHasWhitelabel(agency.plan_tier)) {
      brand = {
        wordmark: agency.display_name.toUpperCase(),
        accountName: agency.display_name,
        footerDomain: primaryHost ?? PLATFORM_BRAND.domain,
        homeHref: primaryHost ? `https://${primaryHost}` : siteUrl(),
        locale,
        logoUrl: tenantLogo,
        // No accent set is not a reason to fall back to the old hardcoded
        // gold: that gold belongs to one specific tenant. An unbranded
        // whitelabel workspace gets the platform forest until it picks a
        // colour of its own.
        accent: tenantAccent ?? TULALA_EMAIL_ACCENT,
        accentOn: tenantAccent ? readableOn(tenantAccent) : TULALA_EMAIL_ACCENT_ON,
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
