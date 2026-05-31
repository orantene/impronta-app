import "server-only";

/**
 * Storefront mount for the Tenant Registration Engine.
 *
 * Rendered once in the root layout. On a tenant storefront where registration
 * is live, it resolves the branded context (slug, display name, logo, CTA
 * label, whether the visitor is already a signed-in Tulala talent) and mounts
 * the tenant register modal host. The host powers every join CTA on the page —
 * the auto header button and any page-builder Join/Register block — and reopens
 * on the `?register=1` return from sign-in.
 *
 * Renders nothing off-tenant or when registration is closed/disabled, so it's a
 * no-op on the marketing site and the app host.
 */

import { headers } from "next/headers";

import { getPublicTenantScope } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { getAppUrl } from "@/lib/auth-flow";
import { cookieDomainForHost } from "@/lib/supabase/cookie-domain";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import {
  loadRegistrationSettings,
  registrationIsLive,
} from "@/lib/saas/registration-settings";
import { loadPublicBranding } from "@/lib/site-admin/server/reads";
import { sanitizeBrandMarkSvg } from "@/lib/site-admin/sanitize-svg";
import { TenantRegisterModalHost } from "./tenant-register-modal-host";

export async function TenantRegisterMount() {
  const scope = await getPublicTenantScope();
  if (!scope) return null;

  const settings = await loadRegistrationSettings(scope.tenantId);
  if (!registrationIsLive(settings)) return null;

  const admin = createServiceRoleClient();
  if (!admin) return null;

  const { data: agency } = await admin
    .from("agencies")
    .select("slug, display_name")
    .eq("id", scope.tenantId)
    .maybeSingle();
  const slug = agency?.slug ?? null;
  if (!slug) return null;
  const displayName = agency?.display_name?.trim() || "this workspace";

  const branding = await loadPublicBranding(scope.tenantId);
  const rawSvg = (branding as { brand_mark_svg?: string | null } | null)
    ?.brand_mark_svg;
  const logoSvg = rawSvg ? sanitizeBrandMarkSvg(rawSvg).svg ?? null : null;

  let isAuthedTalent = false;
  const actor = await getCachedActorSession();
  if (actor.user) {
    const { data: tp } = await admin
      .from("talent_profiles")
      .select("id")
      .eq("user_id", actor.user.id)
      .maybeSingle();
    isAuthedTalent = Boolean(tp?.id);
  }

  // On a tenant CUSTOM domain (host-only cookies), the "sign in to apply" path
  // can't rely on the shared parent-domain session — route it through the SSO
  // hand-off so the session lands on this domain. *.tulala.digital subdomains
  // share the session and skip this.
  const hdrs = await headers();
  const host = (hdrs.get("x-impronta-host-name") ?? hdrs.get("host") ?? "")
    .split(":")[0]
    .toLowerCase();
  const isCustomDomain =
    Boolean(host) && host !== "localhost" && !cookieDomainForHost(host);
  const ssoSignInUrl = isCustomDomain
    ? `${getAppUrl()}/auth/sso/start?return=${encodeURIComponent(
        `https://${host}/${slug}/talent?register=1`,
      )}`
    : undefined;

  return (
    <TenantRegisterModalHost
      tenant={{
        slug,
        displayName,
        logoSvg,
        ctaLabel: settings.ctaLabel,
        isAuthedTalent,
        ssoSignInUrl,
      }}
    />
  );
}
