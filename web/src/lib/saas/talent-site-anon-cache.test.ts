import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { NextRequest, NextResponse } from "next/server";

import {
  applyTalentSiteAnonCacheHeaders,
  TALENT_SITE_ANON_CDN_CACHE,
  TALENT_SITE_PRIVATE_NO_STORE,
  talentSiteLocaleIsPathOnly,
} from "./talent-site-anon-cache";
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
