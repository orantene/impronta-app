/**
 * TUL-1183 wiring that used to sit inline in `proxy.ts`. Kept out of that file
 * so the proxy stays under the 800-line cap. Behavior is the same: plan the
 * seed, stamp cookies after `syncLocaleCookieForPath`, and on a pass-through
 * rebuild the response so the render sees the seeded request headers.
 */
import { NextRequest, NextResponse } from "next/server";

import {
  localeCookieIsAutoWritten,
  seedTalentDashboardLocaleCookie,
  stampLocaleOwner,
  syncLocaleCookieForPath,
} from "@/i18n/locale-middleware";
import type { LanguageSettings } from "@/lib/language-settings/types";
import type { HostContext } from "@/lib/saas/host-context";
import { isTenantHostContext } from "@/lib/saas/proxy-locale-context";
import { ensureExperimentVisitorCookie } from "@/lib/site-admin/builder-node/experiment-visitor-cookie";

import {
  planDashboardLocaleSeed,
  seededRequestHeaders,
  SEED_LOCALE_COOKIE,
  SEED_LOCALE_OWNER_COOKIE,
  type ProxySeedPlan,
} from "./proxy-locale-seed";

export type DashboardSeedHandle = {
  headers(forwarded: Headers): Headers;
  apply(res: NextResponse): void;
};

function handle(plan: ProxySeedPlan): DashboardSeedHandle {
  return {
    headers: (forwarded) => seededRequestHeaders(forwarded, plan),
    apply: (res) => {
      if (plan.locale) seedTalentDashboardLocaleCookie(res, plan.locale);
      if (plan.stamp) stampLocaleOwner(res, plan.userId);
    },
  };
}

export async function loadDashboardLocaleSeed(
  request: NextRequest,
  originalPathname: string,
  forwardedRequestHeaders: Headers,
  effectiveHostContext: HostContext,
): Promise<DashboardSeedHandle | null> {
  const plan = await planDashboardLocaleSeed({
    method: request.method,
    prefetch: Boolean(request.headers.get("next-router-prefetch")) || request.headers.get("purpose") === "prefetch",
    pathname: originalPathname,
    actorId: forwardedRequestHeaders.get("x-impronta-actor-id"),
    cookieLocale: request.cookies.get(SEED_LOCALE_COOKIE)?.value ?? null,
    cookieIsAuto: localeCookieIsAutoWritten(request),
    cookieOwner: request.cookies.get(SEED_LOCALE_OWNER_COOKIE)?.value ?? null,
    hostTenantId: isTenantHostContext(effectiveHostContext) ? effectiveHostContext.tenantId : null,
  });
  return plan ? handle(plan) : null;
}

/** Pass-through exit. With no seed this is the old tail of `proxyInner`. */
export function finishProxyPassThrough(
  sessionRes: NextResponse,
  seed: DashboardSeedHandle | null,
  forwardedRequestHeaders: Headers,
  request: NextRequest,
  originalPathname: string,
  effectiveLangSettings: LanguageSettings,
): NextResponse {
  if (!seed) {
    syncLocaleCookieForPath(sessionRes, originalPathname, effectiveLangSettings, request);
    ensureExperimentVisitorCookie(request, sessionRes);
    return sessionRes;
  }
  // The render must see the seeded cookie too: rebuild the pass-through response with the
  // seeded request headers, carrying over the session cookies and non-middleware headers.
  const seeded = NextResponse.next({ request: { headers: seed.headers(forwardedRequestHeaders) } });
  for (const cookie of sessionRes.cookies.getAll()) seeded.cookies.set(cookie);
  sessionRes.headers.forEach((value, key) => {
    const k = key.toLowerCase();
    if (k.startsWith("x-middleware-") || k === "set-cookie") return;
    seeded.headers.set(key, value);
  });
  syncLocaleCookieForPath(seeded, originalPathname, effectiveLangSettings, request);
  seed.apply(seeded);
  ensureExperimentVisitorCookie(request, seeded);
  return seeded;
}
