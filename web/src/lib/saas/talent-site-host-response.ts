import { NextResponse, type NextRequest } from "next/server";

import {
  clearLocaleCookieAutoMarker,
  LOCALE_COOKIE,
  localeCookieOptions,
  syncLocaleCookieForPath,
} from "@/i18n/locale-middleware";
import { LOCALE_HEADER, ORIGINAL_PATHNAME_HEADER, ORIGINAL_SEARCH_HEADER } from "@/i18n/request-locale";
import { getLanguageSettingsForMiddleware } from "@/lib/language-settings/middleware-locale-cache";
import {
  HOST_CONTEXT_HEADER,
  HOST_NAME_HEADER,
  HOST_TALENT_PROFILE_HEADER,
  HOST_TENANT_SLUG_HEADER,
} from "@/lib/saas/host-context";
import { applyTalentSiteAnonCacheHeaders } from "@/lib/saas/talent-site-anon-cache";
import { attachTalentSiteGuestIdentity } from "@/lib/saas/talent-site-guest-identity";
import { isTalentSiteHostPathAllowed, talentSiteHostRewritePath } from "@/lib/saas/talent-site-host-routing";
import { PUBLIC_PATH_PREFIX_HEADER, TENANT_HEADER_NAME } from "@/lib/saas/scope";
import { talentDemoBareHostRedirectHost } from "@/lib/talent-site/site-public-url";
import { loadTalentLocaleSettingsForProxy } from "@/lib/talent-site/talent-site-locale-proxy";
import { decideTalentSiteLocale, talentSiteQueryLocale } from "@/lib/talent-site/talent-site-locale-routing";

/**
 * Talent custom-domain host (`kind: "talent_site"`, resolved only AFTER
 * agency_domains misses) serves the talent's published Max site. Its surface
 * is intentionally tiny: the site home (`/`), inner page slugs (`/<slug>`),
 * guest `/c/<id>`, public `/pay/<code>` checkout, plus shared plumbing.
 * Anything else 404s: a vanity domain never exposes the workspace, directory,
 * or auth. The render path reads the talent_profile_id from a host header set
 * here, so a client can never spoof it.
 *
 * Language (PR 4, 2026-09-29): the talent's OWN languages and URL grammar,
 * decided by `decideTalentSiteLocale` (prefix > `?locale=` / `?lang=` 302 >
 * primary; the cookie never overrides the URL). An explicit choice is remembered in the `locale` cookie.
 * TUL-516: `?lang=en` is the same choice as `/en`; unsupported query languages
 * get an honest single-language notice instead of a silent ignore.
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
  // Demo convention: any demo subdomain that is not already
  // `{site_slug}-demo.<apex>` 308s to that canonical host (bare cutover and
  // design vanity aliases like folio-demo → mateo-ferrer-demo). Custom domains
  // are untouched.
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
    queryLocale: talentSiteQueryLocale(request.nextUrl.searchParams),
    primary: talentLocales.defaultLocale,
    supported: talentLocales.supportedLocales,
    knownLocales: talentLangSettings.publicLocales,
  });
  const localeStripped = talentLocale.innerPath;

  const talentHeaders = new Headers(sanitizedInboundHeaders);
  talentHeaders.set(LOCALE_HEADER, talentLocale.locale);
  talentHeaders.set(ORIGINAL_PATHNAME_HEADER, request.nextUrl.pathname);
  talentHeaders.set(ORIGINAL_SEARCH_HEADER, request.nextUrl.search);
  talentHeaders.set(HOST_CONTEXT_HEADER, "talent_site");
  talentHeaders.set(HOST_NAME_HEADER, hostContext.hostname);
  talentHeaders.set(HOST_TALENT_PROFILE_HEADER, hostContext.talentProfileId);
  // A talent_site host is NOT tenant-scoped — never let a tenant id leak.
  talentHeaders.delete(TENANT_HEADER_NAME);
  talentHeaders.delete(HOST_TENANT_SLUG_HEADER);
  talentHeaders.delete(PUBLIC_PATH_PREFIX_HEADER);

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
    } else if (request.cookies.get(LOCALE_COOKIE)?.value) {
      // Returning visitor with a locale cookie — keep sync bookkeeping.
      // TUL-445: do NOT auto-stamp locale on a fresh cookieless GET; that
      // Set-Cookie alone prevents CDN caching of anonymous page views.
      syncLocaleCookieForPath(res, localeStripped, talentGrammar, request);
    }
    return res;
  };

  // TUL-516: unsupported `?lang=` / `?locale=` → explicit single-language notice.
  if (
    talentLocale.unsupportedLocale &&
    (request.method === "GET" || request.method === "HEAD")
  ) {
    return rememberChoice(
      NextResponse.rewrite(new URL("/_talent-locale-unavailable", request.url), {
        request: { headers: talentHeaders },
      }),
    );
  }

  if (talentLocale.redirectPath && (request.method === "GET" || request.method === "HEAD")) {
    const target = request.nextUrl.clone();
    target.pathname = talentLocale.redirectPath;
    target.searchParams.delete("locale");
    target.searchParams.delete("lang");
    return rememberChoice(NextResponse.redirect(target, 302));
  }

  const attachGuestCookie = attachTalentSiteGuestIdentity(request, talentHeaders);
  const finish = (res: NextResponse): NextResponse =>
    applyTalentSiteAnonCacheHeaders(rememberChoice(attachGuestCookie(res)), request);
  if (decision.kind === "passthrough") {
    if (localeStripped === pathname) {
      return finish(NextResponse.next({ request: { headers: talentHeaders } }));
    }
    // `/en/c/<id>`: serve the unprefixed route under the chosen language.
    const inner = request.nextUrl.clone();
    inner.pathname = localeStripped;
    return finish(NextResponse.rewrite(inner, { request: { headers: talentHeaders } }));
  }

  const rewriteUrl = request.nextUrl.clone();
  rewriteUrl.pathname = talentSiteHostRewritePath(decision.pageSlug);
  return finish(NextResponse.rewrite(rewriteUrl, { request: { headers: talentHeaders } }));
}
