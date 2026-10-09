// D-MSG-422 (2026-09-24): a talent_site host's rewrite in proxy.ts returns
// before `updateSession` ever runs, so x-impronta-guest never reached a
// guest server action on ANY talent vanity host — every guest ask came back
// "forbidden" and no guest could message a talent.
//
// TUL-445: peek-only — never Set-Cookie / mint here. Write actions mint via
// ensureGuestIdentity (cookie-only; never trusts the header).
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { NextRequest, NextResponse } from "next/server";
import { attachTalentSiteGuestIdentity } from "./talent-site-guest-identity";
import { GUEST_COOKIE_NAME, GUEST_HEADER_NAME, signGuestCookie } from "@/lib/guest-cookie";

const SECRET_ENV = "GUEST_COOKIE_SECRET";

function req(cookie?: string, method = "GET"): NextRequest {
  const headers = new Headers();
  if (cookie) headers.set("cookie", `${GUEST_COOKIE_NAME}=${cookie}`);
  return new NextRequest(new URL("https://book-jorgelina.tulala.digital/"), {
    headers,
    method,
  });
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

  it("TUL-445: a fresh guest GET gets NO header and NO Set-Cookie (CDN-safe)", () => {
    const request = req();
    const talentHeaders = new Headers();
    const attach = attachTalentSiteGuestIdentity(request, talentHeaders);

    assert.equal(talentHeaders.get(GUEST_HEADER_NAME), null);

    const res = attach(NextResponse.next());
    assert.equal(res.cookies.get(GUEST_COOKIE_NAME), undefined);
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

  it("TUL-445: a non-GET without cookie also peeks only (mint is ensureGuestIdentity)", () => {
    const request = req(undefined, "POST");
    const talentHeaders = new Headers({ [GUEST_HEADER_NAME]: "forged-client-value" });
    const attach = attachTalentSiteGuestIdentity(request, talentHeaders);

    assert.equal(talentHeaders.get(GUEST_HEADER_NAME), null);

    const res = attach(NextResponse.next());
    assert.equal(res.cookies.get(GUEST_COOKIE_NAME), undefined);
  });

  it("works on BOTH response kinds the talent_site branch returns: passthrough and rewrite", () => {
    const existingId = "33333333-3333-4333-8333-333333333333";
    const signed = signGuestCookie(existingId);
    const request = req(signed);
    const talentHeaders = new Headers();
    const attach = attachTalentSiteGuestIdentity(request, talentHeaders);

    const passthrough = attach(NextResponse.next({ request: { headers: talentHeaders } }));
    assert.equal(passthrough.cookies.get(GUEST_COOKIE_NAME), undefined);
    assert.equal(talentHeaders.get(GUEST_HEADER_NAME), existingId);

    const rewriteUrl = new URL("https://book-jorgelina.tulala.digital/servicios");
    const rewritten = attach(NextResponse.rewrite(rewriteUrl, { request: { headers: talentHeaders } }));
    assert.equal(rewritten.cookies.get(GUEST_COOKIE_NAME), undefined);
  });
});
