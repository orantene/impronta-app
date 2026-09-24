// D-MSG-422 (2026-09-24): a talent_site host's rewrite in proxy.ts returns
// before `updateSession` ever runs, so x-impronta-guest never reached a
// guest server action on ANY talent vanity host — every guest ask came back
// "forbidden" and no client could message a talent. This pins the fix:
// attachTalentSiteGuestIdentity must set the header AND, for a fresh guest,
// carry the signed cookie on whatever response the branch returns.
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { NextRequest, NextResponse } from "next/server";
import { attachTalentSiteGuestIdentity } from "./talent-site-guest-identity";
import { GUEST_COOKIE_NAME, GUEST_HEADER_NAME, signGuestCookie } from "@/lib/guest-cookie";

const SECRET_ENV = "GUEST_COOKIE_SECRET";

function req(cookie?: string): NextRequest {
  const headers = new Headers();
  if (cookie) headers.set("cookie", `${GUEST_COOKIE_NAME}=${cookie}`);
  return new NextRequest(new URL("https://book-jorgelina.tulala.digital/"), { headers });
}

describe("attachTalentSiteGuestIdentity", () => {
  let previousSecret: string | undefined;

  beforeEach(() => {
    previousSecret = process.env[SECRET_ENV];
    process.env[SECRET_ENV] = "test-secret-for-talent-site-guest-identity";
  });

  afterEach(() => {
    if (previousSecret === undefined) delete process.env[SECRET_ENV];
    else process.env[SECRET_ENV] = previousSecret;
  });

  it("a fresh guest (no cookie) gets the header set AND a Set-Cookie on the response — the exact defect this fixes", () => {
    const request = req();
    const talentHeaders = new Headers();
    const attach = attachTalentSiteGuestIdentity(request, talentHeaders);

    // Before this fix, talentHeaders never got a guest header at all —
    // this is the assertion that would have failed on the old proxy.ts.
    assert.ok(talentHeaders.get(GUEST_HEADER_NAME), "guest header was not set");

    const res = attach(NextResponse.next());
    const setCookie = res.cookies.get(GUEST_COOKIE_NAME);
    assert.ok(setCookie, "no Set-Cookie was attached for a fresh guest — a second request could never reuse this id");
    assert.equal(setCookie!.value.length > 0, true);
  });

  it("a returning guest with a validly-signed cookie keeps the same id and gets NO redundant Set-Cookie", () => {
    const existingId = "22222222-2222-4222-8222-222222222222";
    const signed = signGuestCookie(existingId);
    const request = req(signed);
    const talentHeaders = new Headers();
    const attach = attachTalentSiteGuestIdentity(request, talentHeaders);

    assert.equal(talentHeaders.get(GUEST_HEADER_NAME), existingId);

    const res = attach(NextResponse.next());
    assert.equal(res.cookies.get(GUEST_COOKIE_NAME), undefined);
  });

  it("works on BOTH response kinds the talent_site branch returns: passthrough (NextResponse.next) and rewrite", () => {
    const request = req();
    const talentHeaders = new Headers();
    const attach = attachTalentSiteGuestIdentity(request, talentHeaders);

    const passthrough = attach(NextResponse.next({ request: { headers: talentHeaders } }));
    assert.ok(passthrough.cookies.get(GUEST_COOKIE_NAME));

    const rewriteUrl = new URL("https://book-jorgelina.tulala.digital/servicios");
    const rewritten = attach(NextResponse.rewrite(rewriteUrl, { request: { headers: talentHeaders } }));
    assert.ok(rewritten.cookies.get(GUEST_COOKIE_NAME));
  });
});
