import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { NextRequest, NextResponse } from "next/server";

import {
  applyTalentSiteAnonCacheHeaders,
  TALENT_SITE_ANON_CDN_CACHE,
  TALENT_SITE_PRIVATE_NO_STORE,
  talentSiteLocaleIsPathOnly,
  talentSiteShouldRememberLocale,
} from "./talent-site-anon-cache";
import { LOCALE_AUTO_COOKIE } from "@/i18n/locale-cookies";
import { LOCALE_COOKIE } from "@/i18n/locale-middleware";
import { GUEST_COOKIE_NAME, GUEST_COOKIE_OPTIONS, signGuestCookie } from "@/lib/guest-cookie";

function req(cookieHeader?: string, method = "GET"): NextRequest {
  const headers = new Headers();
  if (cookieHeader) headers.set("cookie", cookieHeader);
  return new NextRequest(new URL("https://book-jorgelina.tulala.digital/"), {
    headers,
    method,
  });
}

describe("applyTalentSiteAnonCacheHeaders", () => {
  // TUL-445 live QA fail: the CDN key ignored cookies, so a signed-in or
  // guest-cookied visitor was served the cached anonymous page. Every
  // talent-site response must carry Vary: Cookie so a cookie-bearing request
  // can never match an entry stored for a cookieless one.
  it("varies the public CDN entry on Cookie", () => {
    const res = applyTalentSiteAnonCacheHeaders(NextResponse.next(), req());
    assert.match(res.headers.get("Vary") ?? "", /(^|,\s*)Cookie(\s*,|$)/i);
  });

  it("varies the private response on Cookie too and keeps existing Vary values", () => {
    const base = NextResponse.next();
    base.headers.set("Vary", "RSC, Accept-Encoding");
    const res = applyTalentSiteAnonCacheHeaders(base, req("sb-abc-auth-token=x"));
    const vary = res.headers.get("Vary") ?? "";
    assert.match(vary, /RSC/);
    assert.match(vary, /Accept-Encoding/);
    assert.match(vary, /(^|,\s*)Cookie(\s*,|$)/i);
  });

  it("does not duplicate Cookie in Vary", () => {
    const base = NextResponse.next();
    base.headers.set("Vary", "cookie");
    const res = applyTalentSiteAnonCacheHeaders(base, req());
    assert.equal((res.headers.get("Vary") ?? "").toLowerCase().split(",").filter((v) => v.trim() === "cookie").length, 1);
  });

  it("sets public CDN cache for a cookieless GET with no Set-Cookie on the response", () => {
    const res = applyTalentSiteAnonCacheHeaders(NextResponse.next(), req());
    assert.equal(res.headers.get("Cache-Control"), TALENT_SITE_ANON_CDN_CACHE);
    assert.equal(res.headers.get("CDN-Cache-Control"), TALENT_SITE_ANON_CDN_CACHE);
    assert.equal(res.headers.get("Vercel-CDN-Cache-Control"), TALENT_SITE_ANON_CDN_CACHE);
  });

  it("stays private when the visitor already has impronta_guest", () => {
    process.env.GUEST_COOKIE_SECRET = "test-secret-for-anon-cache";
    const signed = signGuestCookie("44444444-4444-4444-8444-444444444444");
    const res = applyTalentSiteAnonCacheHeaders(
      NextResponse.next(),
      req(`${GUEST_COOKIE_NAME}=${signed}`),
    );
    assert.equal(res.headers.get("Cache-Control"), TALENT_SITE_PRIVATE_NO_STORE);
  });

  it("stays private when a locale cookie is present (path-locale-only CDN)", () => {
    const res = applyTalentSiteAnonCacheHeaders(
      NextResponse.next(),
      req(`${LOCALE_COOKIE}=en`),
    );
    assert.equal(talentSiteLocaleIsPathOnly(req(`${LOCALE_COOKIE}=en`)), false);
    assert.equal(talentSiteLocaleIsPathOnly(req()), true);
    assert.equal(res.headers.get("Cache-Control"), TALENT_SITE_PRIVATE_NO_STORE);
  });

  it("stays private when the response itself Sets a cookie", () => {
    const res = NextResponse.next();
    res.cookies.set(GUEST_COOKIE_NAME, "x", GUEST_COOKIE_OPTIONS);
    const out = applyTalentSiteAnonCacheHeaders(res, req());
    assert.equal(out.headers.get("Cache-Control"), TALENT_SITE_PRIVATE_NO_STORE);
  });

  it("stays private for POST", () => {
    const res = applyTalentSiteAnonCacheHeaders(NextResponse.next(), req(undefined, "POST"));
    assert.equal(res.headers.get("Cache-Control"), TALENT_SITE_PRIVATE_NO_STORE);
  });
});

describe("talentSiteShouldRememberLocale", () => {
  it("skips the write on a cookieless /en page view so it stays cacheable", () => {
    assert.equal(talentSiteShouldRememberLocale(req(), "en", { redirect: false }), false);
  });

  it("writes on a ?locale= redirect", () => {
    assert.equal(talentSiteShouldRememberLocale(req(), "en", { redirect: true }), true);
  });

  it("writes when the cookie names another language", () => {
    assert.equal(talentSiteShouldRememberLocale(req(`${LOCALE_COOKIE}=es`), "en", { redirect: false }), true);
  });

  it("writes when the matching cookie was machine-written", () => {
    assert.equal(
      talentSiteShouldRememberLocale(req(`${LOCALE_COOKIE}=en; ${LOCALE_AUTO_COOKIE}=1`), "en", { redirect: false }),
      true,
    );
  });

  it("skips when the visitor already chose this language", () => {
    assert.equal(talentSiteShouldRememberLocale(req(`${LOCALE_COOKIE}=en`), "en", { redirect: false }), false);
  });
});
