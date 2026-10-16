import "server-only";

/**
 * posts-public-site.ts — which SITE a public `/blog/*`, sitemap, robots or
 * llms.txt request belongs to, resolved from the proxy-set host headers.
 *
 *   agency host      → workspace site, scope { kind:"tenant" } from the verified
 *                      tenant header (`getPublicTenantScope`)
 *   talent_site host → talent personal site, scope { kind:"talent" } from
 *                      `x-impronta-talent-profile`, trusted ONLY through
 *                      `resolveGatedTalentProfileId` (same gate as the
 *                      `/_talent-site` host route)
 *   anything else    → null (the route 404s)
 *
 * The profile/tenant id is never read from the URL.
 */

import { headers } from "next/headers";

import { localeAlternateUrl } from "@/i18n/alternates";
import { resolveTenantBrand } from "@/lib/brand/resolve-tenant-brand";
import type { PostScope } from "@/lib/cms/posts-writer";
import type { LocalizedUrl } from "@/lib/cms/posts-public-model";
import {
  HOST_CONTEXT_HEADER,
  HOST_NAME_HEADER,
  HOST_TALENT_PROFILE_HEADER,
} from "@/lib/saas/host-context";
import { getPublicHostContext, getPublicPathPrefix, getPublicTenantScope } from "@/lib/saas/scope";
import { publicRequestSiteBase } from "@/lib/seo/request-base";
import { loadTenantLocaleSettings } from "@/lib/site-admin/server/locale-resolver";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { resolveGatedTalentProfileId } from "@/lib/talent-site/server/talent-site-host-gate";
import { loadTalentLocaleSettingsForProxy } from "@/lib/talent-site/talent-site-locale-proxy";

export type PostSiteFamily = "workspace" | "talent";

export type PostSiteContext = {
  family: PostSiteFamily;
  scope: PostScope;
  /** `https://host` the request is served from. */
  origin: string;
  /** Path-based workspace prefix (`/w/<slug>`), "" on own hosts and talent sites. */
  pathPrefix: string;
  defaultLocale: string;
  supportedLocales: readonly string[];
  siteName: string;
  /** Talent sites: a person writes; workspace sites: the organization. */
  authorKind: "person" | "organization";
};

/** Absolute URL of a locale-free path in one locale, in this site's URL grammar. */
export function postSiteUrlFor(site: PostSiteContext): LocalizedUrl {
  return (path, locale) =>
    localeAlternateUrl(
      {
        origin: site.origin,
        pathnameWithoutLocale: path,
        defaultLocale: site.defaultLocale,
        supportedLocales: site.supportedLocales.includes(locale) ? site.supportedLocales : [...site.supportedLocales, locale],
        pathPrefix: site.pathPrefix,
      },
      locale,
    );
}

/** Origin-relative href (for links inside the page). */
export function postSiteHref(site: PostSiteContext, path: string, locale: string): string {
  const abs = new URL(postSiteUrlFor(site)(path, locale));
  return `${abs.pathname}${abs.search}`;
}

async function resolveTalentProfileIdFromHeaders(): Promise<string | null> {
  try {
    const h = await headers();
    return resolveGatedTalentProfileId({
      hostContext: h.get(HOST_CONTEXT_HEADER),
      talentProfileId: h.get(HOST_TALENT_PROFILE_HEADER),
    });
  } catch {
    return null;
  }
}

async function servedHostName(): Promise<string | null> {
  try {
    return (await headers()).get(HOST_NAME_HEADER)?.trim() || null;
  } catch {
    return null;
  }
}

export async function resolveWorkspacePostSite(): Promise<PostSiteContext | null> {
  const hostContext = await getPublicHostContext();
  if (hostContext.kind !== "agency") return null;
  const tenant = await getPublicTenantScope();
  if (!tenant) return null;
  const [locales, brand, pathPrefix] = await Promise.all([
    loadTenantLocaleSettings(tenant.tenantId),
    resolveTenantBrand(tenant.tenantId).catch(() => null),
    getPublicPathPrefix(),
  ]);
  return {
    family: "workspace",
    scope: { kind: "tenant", tenantId: tenant.tenantId },
    origin: publicRequestSiteBase(hostContext).origin,
    pathPrefix,
    defaultLocale: locales.defaultLocale,
    supportedLocales: locales.supportedLocales,
    siteName: brand?.accountName?.trim() || brand?.wordmark?.trim() || "Website",
    authorKind: "organization",
  };
}

export async function resolveTalentPostSite(): Promise<PostSiteContext | null> {
  const talentProfileId = await resolveTalentProfileIdFromHeaders();
  if (!talentProfileId) return null;
  const host = await servedHostName();
  const hostContext = await getPublicHostContext();
  const origin = host ? `https://${host}` : publicRequestSiteBase(hostContext).origin;
  const [locales, name] = await Promise.all([
    loadTalentLocaleSettingsForProxy(talentProfileId),
    loadTalentDisplayName(talentProfileId),
  ]);
  return {
    family: "talent",
    scope: { kind: "talent", talentProfileId },
    origin,
    pathPrefix: "",
    defaultLocale: locales.defaultLocale,
    supportedLocales: locales.supportedLocales,
    siteName: name ?? "Website",
    authorKind: "person",
  };
}

/** Whichever family this host serves. */
export async function resolveAnyPostSite(): Promise<PostSiteContext | null> {
  const hostContext = await getPublicHostContext();
  if (hostContext.kind === "talent_site") return resolveTalentPostSite();
  if (hostContext.kind === "agency") return resolveWorkspacePostSite();
  return null;
}

async function loadTalentDisplayName(talentProfileId: string): Promise<string | null> {
  const db = createServiceRoleClient();
  if (!db) return null;
  const { data, error } = await db
    .from("talent_profiles")
    .select("display_name, first_name")
    .eq("id", talentProfileId)
    .maybeSingle();
  if (error) {
    logServerError("cms/posts-public-site/talent-name", error);
    return null;
  }
  const row = data as { display_name: string | null; first_name: string | null } | null;
  return row?.display_name?.trim() || row?.first_name?.trim() || null;
}

/**
 * "IA puede leer mi sitio" (default ON). agency_branding for workspace sites,
 * talent_sites for talent sites. A read error or missing row keeps the default.
 */
export async function loadAiCrawlersAllowed(scope: PostScope): Promise<boolean> {
  const db = createServiceRoleClient();
  if (!db) return true;
  const { data, error } =
    scope.kind === "tenant"
      ? await db.from("agency_branding").select("ai_crawlers_allowed").eq("tenant_id", scope.tenantId).maybeSingle()
      : await db.from("talent_sites").select("ai_crawlers_allowed").eq("talent_profile_id", scope.talentProfileId).maybeSingle();
  if (error) logServerError("cms/posts-public-site/ai-crawlers", error);
  if (error || !data) return true;
  return (data as { ai_crawlers_allowed: boolean | null }).ai_crawlers_allowed !== false;
}
