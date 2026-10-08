import { NextResponse, type NextRequest } from "next/server";

import {
  clearLocaleCookieAutoMarker,
  LOCALE_COOKIE,
  localeCookieOptions,
  syncLocaleCookieForPath,
} from "@/i18n/locale-middleware";
import { LOCALE_HEADER, ORIGINAL_PATHNAME_HEADER } from "@/i18n/request-locale";
import { getLanguageSettingsForMiddleware } from "@/lib/language-settings/middleware-locale-cache";
import {
  HOST_CONTEXT_HEADER,
  HOST_NAME_HEADER,
  HOST_TALENT_PROFILE_HEADER,
  HOST_TENANT_SLUG_HEADER,
} from "@/lib/saas/host-context";
import { attachTalentSiteGuestIdentity } from "@/lib/saas/talent-site-guest-identity";
import { isTalentSiteHostPathAllowed, talentSiteHostRewritePath } from "@/lib/saas/talent-site-host-routing";
import { PUBLIC_PATH_PREFIX_HEADER, TENANT_HEADER_NAME } from "@/lib/saas/scope";
import { talentDemoBareHostRedirectHost } from "@/lib/talent-site/site-public-url";
import { loadTalentLocaleSettingsForProxy } from "@/lib/talent-site/talent-site-locale-proxy";
import { decideTalentSiteLocale } from "@/lib/talent-site/talent-site-locale-routing";

/**
 * Talent custom-domain host (`kind: "talent_site"`, resolved only AFTER
 * agency_domains misses) serves the talent's published Max site. Its surface
 * is intentionally tiny: the site home (`/`), inner page slugs (`/<slug>`),
 * guest `/c/<id>`, public `/pay/<code>` checkout, plus shared plumbing.
 * Anything else 404s: a vanity domain never exposes the workspace, directory,
 * or auth. The render path reads the talent_profile_id from a host header set
 * here, so a client can never spoof it.
 *
 * Language (PR 4, 2026-09-29; TUL-363 path-is-truth): the talent's OWN
 * languages and URL grammar, decided by `decideTalentSiteLocale` (prefix >
 * `?locale=` 302 > primary). The cookie may only suggest; it never overrides
 * the path. An explicit prefix/`?locale=` choice is still remembered in the
 * `locale` cookie for the suggestion banner.
 */
export async function talentSiteHostResponse(
  request: NextRequest,
  pathname: string,
  sanitizedInboundHeaders: Headers,
  hostContext: {
    hostname: string;
    talentProfileId: string;
    hostKind?: "subdomain" | "custom";
    isDemo?: boolean;
    siteSlug?: string | null;
  },
): Promise<NextResponse> {
  // Demo convention: bare `{site_slug}.tulala.digital` 308s to the canonical
  // `{site_slug}-demo.tulala.digital` public host. Custom domains are untouched.
  if (
    hostContext.hostKind === "subdomain" &&
    (request.method === "GET" || request.method === "HEAD")
  ) {
    const canonicalHost = talentDemoBareHostRedirectHost({
      hostname: hostContext.hostname,
      siteSlug: hostContext.siteSlug,
      isDemo: hostContext.isDemo === true,
    });
    if (canonicalHost && canonicalHost !== hostContext.hostname) {
      const target = request.nextUrl.clone();
      target.hostname = canonicalHost;
      return NextResponse.redirect(target, 308);
    }
  }

  // The TALENT's own languages and URL grammar (primary unprefixed,
  // secondaries under `/<code>/`), see talent-site-locale-routing.ts.
  const [talentLangSettings, talentLocales] = await Promise.all([
    getLanguageSettingsForMiddleware(),
    loadTalentLocaleSettingsForProxy(hostContext.talentProfileId),
  ]);
  const talentGrammar = { ...talentLangSettings, defaultLocale: talentLocales.defaultLocale, publicLocales: [...talentLocales.supportedLocales] };
  const talentLocale = decideTalentSiteLocale({
    pathname,
    queryLocale: request.nextUrl.searchParams.get("locale"),
    cookieLocale: request.cookies.get(LOCALE_COOKIE)?.value,
    primary: talentLocales.defaultLocale,
    supported: talentLocales.supportedLocales,
  });
  const localeStripped = talentLocale.innerPath;

  const decision = isTalentSiteHostPathAllowed(localeStripped);
  if (!decision) {
    return NextResponse.rewrite(
      new URL("/_page-not-found", request.url),
      { status: 404 },
    );
  }
  const rememberChoice = (res: NextResponse): NextResponse => {
    if (talentLocale.explicit) {
      res.cookies.set(LOCALE_COOKIE, talentLocale.locale, localeCookieOptions);
      clearLocaleCookieAutoMarker(res);
    } else {
      syncLocaleCookieForPath(res, localeStripped, talentGrammar, request);
    }
    return res;
  };
  if (talentLocale.redirectPath && (request.method === "GET" || request.method === "HEAD")) {
    const target = request.nextUrl.clone();
    target.pathname = talentLocale.redirectPath;
    target.searchParams.delete("locale");
    return rememberChoice(NextResponse.redirect(target, 302));
  }

  const talentHeaders = new Headers(sanitizedInboundHeaders);
  talentHeaders.set(LOCALE_HEADER, talentLocale.locale);
  talentHeaders.set(ORIGINAL_PATHNAME_HEADER, request.nextUrl.pathname);
  talentHeaders.set(HOST_CONTEXT_HEADER, "talent_site");
  talentHeaders.set(HOST_NAME_HEADER, hostContext.hostname);
  talentHeaders.set(HOST_TALENT_PROFILE_HEADER, hostContext.talentProfileId);
  // A talent_site host is NOT tenant-scoped — never let a tenant id leak.
  talentHeaders.delete(TENANT_HEADER_NAME);
  talentHeaders.delete(HOST_TENANT_SLUG_HEADER);
  talentHeaders.delete(PUBLIC_PATH_PREFIX_HEADER);

  const attachGuestCookie = attachTalentSiteGuestIdentity(request, talentHeaders);
  if (decision.kind === "passthrough") {
    if (localeStripped === pathname) {
      return attachGuestCookie(NextResponse.next({ request: { headers: talentHeaders } }));
    }
    // `/en/c/<id>`: serve the unprefixed route under the chosen language.
    const inner = request.nextUrl.clone();
    inner.pathname = localeStripped;
    return rememberChoice(attachGuestCookie(NextResponse.rewrite(inner, { request: { headers: talentHeaders } })));
  }

  const rewriteUrl = request.nextUrl.clone();
  rewriteUrl.pathname = talentSiteHostRewritePath(decision.pageSlug);
  return rememberChoice(attachGuestCookie(NextResponse.rewrite(rewriteUrl, { request: { headers: talentHeaders } })));
}
