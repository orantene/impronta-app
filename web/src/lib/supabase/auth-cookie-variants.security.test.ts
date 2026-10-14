/**
 * TUL-621 / TUL-708: two auth sessions on .tulala.digital. A browser can hold
 * the same Supabase auth cookie at several scopes (host-only, the host's own
 * Domain, an intermediate parent like .staging.tulala.digital, and the shared
 * .tulala.digital). Sign-out must expire every scope and every chunk; a
 * cross-scope duplicate must be swept down to the canonical scope; guest
 * flows must never touch auth cookies.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { NextRequest, NextResponse } from "next/server";

import {
  TALENT_HOST_SIGN_OUT_PATH,
  talentHostSignOutResponse,
} from "@/lib/client-account/talent-host-session";

import { appendAuthScopeSweep } from "./auth-scope-sweep";

import {
  authCookieExpiryHeaders,
  authCookieScopeVariants,
  duplicateAuthCookieNames,
  nonCanonicalAuthCookieExpiryHeaders,
} from "./cookie-domain";

const SRC = join(process.cwd(), "src");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");

test("scope variants on a staging app host cover host-only, intermediate parents and the shared root", () => {
  assert.deepEqual(authCookieScopeVariants("app.staging.tulala.digital"), [
    undefined,
    ".app.staging.tulala.digital",
    ".staging.tulala.digital",
    ".tulala.digital",
  ]);
  assert.deepEqual(authCookieScopeVariants("localhost:3000"), [undefined]);
  assert.deepEqual(authCookieScopeVariants("improntamodels.com"), [undefined]);
});

test("sign-out expiry clears every scope and every chunk of each auth cookie", () => {
  const h = authCookieExpiryHeaders(["sb-x-auth-token"], "app.staging.tulala.digital");
  for (const name of ["sb-x-auth-token", "sb-x-auth-token.0", "sb-x-auth-token.1"]) {
    assert.ok(h.includes(`${name}=; Path=/; Max-Age=0`), `${name} host-only`);
    for (const d of [".app.staging.tulala.digital", ".staging.tulala.digital", ".tulala.digital"]) {
      assert.ok(h.includes(`${name}=; Path=/; Max-Age=0; Domain=${d}`), `${name} ${d}`);
    }
  }
});

test("duplicate auth cookie names are detected from the raw Cookie header", () => {
  assert.deepEqual(
    duplicateAuthCookieNames("sb-x-auth-token=a; other=1; sb-x-auth-token=b; sb-x-auth-token.0=c"),
    ["sb-x-auth-token"],
  );
  assert.deepEqual(duplicateAuthCookieNames("sb-x-auth-token=a; impronta_guest=g"), []);
});

test("cross-scope sweep never expires the canonical shared-domain cookie", () => {
  const h = nonCanonicalAuthCookieExpiryHeaders(["sb-x-auth-token"], "app.staging.tulala.digital");
  assert.ok(h.length > 0);
  assert.ok(!h.some((x) => x.endsWith("Domain=.tulala.digital")));
  assert.ok(h.includes("sb-x-auth-token=; Path=/; Max-Age=0"));
  assert.ok(h.includes("sb-x-auth-token=; Path=/; Max-Age=0; Domain=.staging.tulala.digital"));
});

test("the sweep wraps the FINAL proxy response (rewrites + talent hosts included)", () => {
  const src = read("proxy.ts");
  assert.match(src, /export const proxy = withAuthScopeSweep\(proxyInner\)/);
  assert.ok(src.split("\n").length <= 801, "proxy.ts stays at or under 800 lines");
});

test("appendAuthScopeSweep expires non-canonical scopes only when a duplicate is sent", () => {
  const mk = (host: string, cookie: string) =>
    new NextRequest(`https://${host}/x`, { headers: { host, cookie } });
  const dup = appendAuthScopeSweep(
    mk("sofia.tulala.digital", "sb-x-auth-token=old; sb-x-auth-token=new"),
    NextResponse.rewrite(new URL("https://sofia.tulala.digital/y")),
  ).headers.getSetCookie();
  assert.ok(dup.includes("sb-x-auth-token=; Path=/; Max-Age=0"));
  assert.ok(!dup.some((h) => h.includes("Domain=.tulala.digital")));
  const single = appendAuthScopeSweep(
    mk("app.tulala.digital", "sb-x-auth-token=a"),
    NextResponse.next(),
  ).headers.getSetCookie();
  assert.deepEqual(single, []);
  const custom = appendAuthScopeSweep(
    mk("jane.com", "sb-x-auth-token=a; sb-x-auth-token=b"),
    NextResponse.next(),
  ).headers.getSetCookie();
  assert.deepEqual(custom, []);
});

test("talent-host sign-out expires every scope on a platform subdomain, host-only on a custom domain", () => {
  const req = (host: string, site = "same-origin") =>
    new NextRequest(`https://${host}${TALENT_HOST_SIGN_OUT_PATH}`, {
      headers: { host, cookie: "sb-x-auth-token=a; impronta_guest=g", "sec-fetch-site": site },
    });
  const sub = talentHostSignOutResponse(req("sofia.tulala.digital"), { hostname: "sofia.tulala.digital", hostKind: "subdomain" });
  assert.ok(sub);
  assert.equal(sub.status, 303);
  const subH = sub.headers.getSetCookie();
  assert.ok(subH.includes("sb-x-auth-token=; Path=/; Max-Age=0; Domain=.tulala.digital"));
  assert.ok(subH.includes("sb-x-auth-token.1=; Path=/; Max-Age=0"));
  assert.ok(subH.some((h) => h.startsWith("impronta_guest=")));
  const custom = talentHostSignOutResponse(req("jane.com"), { hostname: "jane.com", hostKind: "custom" });
  assert.ok(custom?.headers.getSetCookie().every((h) => !h.includes("Domain=")));
  const cross = talentHostSignOutResponse(req("sofia.tulala.digital", "cross-site"), { hostname: "sofia.tulala.digital", hostKind: "subdomain" });
  assert.deepEqual(cross?.headers.getSetCookie(), []);
  const other = new NextRequest("https://sofia.tulala.digital/", { headers: { host: "sofia.tulala.digital" } });
  assert.equal(talentHostSignOutResponse(other, { hostname: "sofia.tulala.digital", hostKind: "subdomain" }), null);
});

test("client popover Log out ends at /auth/client-sign-out, which exists on non-talent hosts too", () => {
  const btn = read("components/client-account/ClientAccountButton.tsx");
  const fn = btn.slice(btn.indexOf("async function logOut"), btn.indexOf("async function logOut") + 600);
  assert.match(fn, /signOutClientAccount\(\)[\s\S]*\/auth\/client-sign-out/);
  assert.match(read("app/auth/client-sign-out/route.ts"), /export \{ GET \} from "\.\.\/sign-out\/route"/);
});

test("account settings Log out ends at /auth/sign-out (all scopes), not a 200 on /account", () => {
  const src = read("components/client-account/AccountClientIslands.tsx");
  const body = src.slice(src.indexOf("export function LogOutButton"));
  const fn = body.slice(0, body.indexOf("\nexport "));
  assert.match(fn, /signOutClientAccount\(\)/);
  assert.match(fn, /\/auth\/sign-out/);
  assert.doesNotMatch(fn, /router\.refresh\(\)/);
});

test("guest chat / guest client paths never sign in or set an auth session", () => {
  for (const p of [
    "lib/client-account/guest-activate.server.ts",
    "lib/server-actions/client-guest-merge.ts",
    "lib/inquiry/guest-client.ts",
    "lib/inquiry/guest-continue-thread.ts",
    "lib/inquiry/guest-send-gate.ts",
    "lib/inquiry/guest-claim-link.ts",
    "lib/inquiry/guest-auto-ack.ts",
  ]) {
    const code = read(p).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    assert.doesNotMatch(code, /auth\.(signIn\w*|verifyOtp|setSession|signUp|exchangeCodeForSession)\(/, p);
  }
  const guest = read("lib/guest-cookie.ts");
  assert.match(guest, /GUEST_COOKIE_NAME = "impronta_guest"/);
  const opts = guest.slice(guest.indexOf("GUEST_COOKIE_OPTIONS = {"), guest.indexOf("};", guest.indexOf("GUEST_COOKIE_OPTIONS = {")));
  assert.doesNotMatch(opts, /domain/i, "guest cookie must stay host-only");
});
