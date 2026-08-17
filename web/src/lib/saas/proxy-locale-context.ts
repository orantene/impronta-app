/**
 * Which tenant's URL grammar governs THIS request — owned here so proxy.ts
 * stays under its 800-line cap (same reason `workspace-path-redirects.ts` was
 * carved out).
 *
 * URL grammar is per-tenant: `agency_business_identity.default_locale` is served
 * UNPREFIXED and every other entry in `supported_locales` sits under `/{code}`.
 * So the grammar INVERTS when a tenant flips its default — a tenant moving from
 * `en` to `es` starts serving `/models` as Spanish and `/en/models` as English.
 *
 * The bug this module fixes: the proxy used to apply the HOST tenant's grammar
 * to the default-locale strip, the supported-locale enforcement and the
 * allow-list canonicalization, and only resolved the PATH tenant (`/w/<slug>/…`
 * on the hub/marketing/local-app hosts) afterwards. A path tenant whose default
 * locale differed from the hub's therefore had its canonical URL rewritten by
 * the wrong grammar on every single request.
 *
 * Resolution order here is deliberate and non-circular:
 *   1. Strip any leading PLATFORM locale segment — locale-agnostic, because we
 *      do not yet know whose grammar applies. The global `publicLocales` list is
 *      a superset of every tenant's, so this cannot miss a prefix.
 *   2. Resolve the path tenant from that bare path.
 *   3. The SERVED tenant (path tenant if any, else host tenant) supplies the
 *      grammar every downstream locale decision uses.
 *
 * Host-based agency tenants are unaffected by construction: they never satisfy
 * `canResolvePathBasedTenant`, so `effectiveLangSettings` collapses to the host
 * tenant's settings exactly as before.
 */

import type { NextRequest } from "next/server";

import { pathnameWithoutAnyLocalePrefix } from "@/i18n/pathnames";
import type { LanguageSettings } from "@/lib/language-settings/types";
import {
  resolveTenantContextFromPathSlug,
  type HostContext,
} from "@/lib/saas/host-context";
import { resolveWorkspacePathTenantPublicPath } from "@/lib/saas/surface-allow-list";
import {
  loadTenantLocaleSettings,
  type TenantLocaleSettings,
} from "@/lib/site-admin/server/locale-resolver";

export type TenantHostContext = Extract<
  HostContext,
  { kind: "agency" | "hub" }
>;

export function isTenantHostContext(
  context: HostContext,
): context is TenantHostContext {
  return context.kind === "agency" || context.kind === "hub";
}

export function isLocalhostHost(hostHeader: string): boolean {
  const hostname = hostHeader.split(":")[0]?.trim().toLowerCase();
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

/** Overlay a tenant's locale pair onto the global settings object. */
export function withTenantLanguageSettings(
  base: LanguageSettings,
  tenantSettings: TenantLocaleSettings | null,
): LanguageSettings {
  if (!tenantSettings) return base;
  return {
    ...base,
    defaultLocale: tenantSettings.defaultLocale,
    publicLocales: [...tenantSettings.supportedLocales],
  };
}

export interface ProxyLocaleContext {
  /** Hosts where a `/w/<slug>` path segment can name a tenant. */
  canResolvePathBasedTenant: boolean;
  /** Non-null only when the URL names a real path-based tenant. */
  pathBasedTenantContext: HostContext | null;
  /** Path tenant when there is one, else the host context. */
  effectiveHostContext: HostContext;
  /** Locale settings of the tenant actually being SERVED. */
  effectiveTenantLocaleSettings: TenantLocaleSettings | null;
  /** `langSettings` with the served tenant's grammar applied. */
  effectiveLangSettings: LanguageSettings;
}

export async function resolveProxyLocaleContext(params: {
  request: NextRequest;
  hostHeader: string;
  pathname: string;
  hostContext: HostContext;
  hostTenantLocaleSettings: TenantLocaleSettings | null;
  langSettings: LanguageSettings;
}): Promise<ProxyLocaleContext> {
  const {
    request,
    hostHeader,
    pathname,
    hostContext,
    hostTenantLocaleSettings,
    langSettings,
  } = params;

  const canResolvePathBasedTenant =
    hostContext.kind === "hub" ||
    hostContext.kind === "marketing" ||
    (hostContext.kind === "app" && isLocalhostHost(hostHeader));

  const localeAgnosticPath = pathnameWithoutAnyLocalePrefix(pathname, langSettings);
  const probe = canResolvePathBasedTenant
    ? resolveWorkspacePathTenantPublicPath(localeAgnosticPath)
    : null;
  const pathBasedTenantContext = probe
    ? await resolveTenantContextFromPathSlug(request, hostHeader, probe.tenantSlug)
    : null;

  const effectiveTenantLocaleSettings =
    pathBasedTenantContext && isTenantHostContext(pathBasedTenantContext)
      ? await loadTenantLocaleSettings(pathBasedTenantContext.tenantId)
      : hostTenantLocaleSettings;

  return {
    canResolvePathBasedTenant,
    pathBasedTenantContext,
    effectiveHostContext: pathBasedTenantContext ?? hostContext,
    effectiveTenantLocaleSettings,
    effectiveLangSettings: withTenantLanguageSettings(
      langSettings,
      effectiveTenantLocaleSettings,
    ),
  };
}
