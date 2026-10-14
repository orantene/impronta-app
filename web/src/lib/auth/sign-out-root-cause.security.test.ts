/**
 * S1 ROOT CAUSE (TUL-708 / TUL-712 / "older client session takes over").
 *
 * Middleware trusts any auth cookie whose JWT verifies locally (getClaims), so
 * a revoked refresh token does not end a session: every copy of the cookie
 * must be gone and nothing may write a new one. Two things broke that:
 *   1. the proxy ran its session refresh on the sign-out request itself and
 *      re-issued a fresh auth cookie (stale access token => first click fails,
 *      the second click has a fresh token, no refresh, so it "works");
 *   2. Log out was a server action (one cookie scope) followed by a client
 *      `location.assign` hop that is not guaranteed to run, leaving copies at
 *      the other scopes.
 * These tests replay both with a cookie jar across two hosts.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { NextRequest } from "next/server";

import { authCookieScopeVariants } from "@/lib/supabase/cookie-domain";

import { CLIENT_SIGN_OUT_PATH, SIGN_OUT_PATH, isSessionSensitivePage, isSignOutPath } from "./sign-out-paths";

const SRC = join(process.cwd(), "src");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");

const REF = "qaref";
const AUTH = `sb-${REF}-auth-token`;
process.env.NEXT_PUBLIC_SUPABASE_URL = `https://${REF}.supabase.co`;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-test-key";

// ---------------------------------------------------------------- cookie jar
type Jar = Map<string, string>; // key: `${name}|${domain ?? "host:" + host}`
function jarSet(jar: Jar, host: string, header: string) {
  const [pair, ...attrs] = header.split(";").map((p) => p.trim());
  const name = pair!.slice(0, pair!.indexOf("="));
  const value = pair!.slice(pair!.indexOf("=") + 1);
  const dom = attrs.find((a) => /^domain=/i.test(a))?.slice(7).toLowerCase();
  const expired = attrs.some((a) => /^max-age=0$/i.test(a)) || value === "";
  if (dom && !(`.${host}`.endsWith(dom))) return; // browser rejects foreign Domain
  const key = `${name}|${dom ?? `host:${host}`}`;
  if (expired) jar.delete(key);
  else jar.set(key, value);
}
/** Cookies the browser sends to `host`. */
function jarCookies(jar: Jar, host: string): string[] {
  const out: string[] = [];
  for (const [key, value] of jar) {
    const [name, scope] = key.split("|");
    const ok = scope === `host:${host}` || (!scope!.startsWith("host:") && `.${host}`.endsWith(scope!));
    if (ok) out.push(`${name}=${value}`);
  }
  return out;
}
function signedInJar(): Jar {
  const jar: Jar = new Map();
  // A session held at every scope a browser may have accumulated.
  for (const d of authCookieScopeVariants("app.staging.tulala.digital")) {
    jar.set(`${AUTH}|${d ?? "host:app.staging.tulala.digital"}`, session(FUTURE));
  }
  jar.set(`${AUTH}|host:book-sofia.staging.tulala.digital`, session(FUTURE));
  return jar;
}

const FUTURE = Math.floor(Date.now() / 1000) + 3600;

/** Route tests revoke through fetch; answer locally, never hit the network. */
async function withStubFetch<T>(fn: () => Promise<T>): Promise<T> {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(null, { status: 204 })) as unknown as typeof fetch;
  try {
    return await fn();
  } finally {
    globalThis.fetch = realFetch;
  }
}

function session(expiresAt: number) {
  const s = {
    access_token: "header.payload.sig",
    refresh_token: "refresh-1",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: expiresAt,
    user: { id: "client2", email: "client2@example.test", aud: "authenticated" },
  };
  return `base64-${Buffer.from(JSON.stringify(s)).toString("base64url")}`;
}

test("ROOT CAUSE 1: the proxy session refresh never re-mints a cookie on the sign-out request", async () => {
  const realFetch = globalThis.fetch;
  let refreshed = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("grant_type=refresh_token")) {
      refreshed++;
      return new Response(
        JSON.stringify({
          access_token: "new.access.token",
          refresh_token: "refresh-2",
          token_type: "bearer",
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user: { id: "client2", aud: "authenticated" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const { updateSession } = await import("@/lib/supabase/middleware");
    for (const path of [SIGN_OUT_PATH, CLIENT_SIGN_OUT_PATH]) {
      const req = new NextRequest(`https://app.staging.tulala.digital${path}`, {
        method: "POST",
        headers: {
          host: "app.staging.tulala.digital",
          // Stale access token: any refresh here would write a NEW session.
          cookie: `${AUTH}=${session(Math.floor(Date.now() / 1000) - 60)}`,
        },
      });
      const { response } = await updateSession(req, {
        pathnameForAuth: path,
        hostKind: "app",
        resolvedHost: "app.staging.tulala.digital",
      });
      const reMinted = response.headers
        .getSetCookie()
        .filter((h) => h.startsWith("sb-") && !/^[^=]+=;/.test(h) && !/max-age=0/i.test(h));
      assert.deepEqual(reMinted, [], `${path} re-issued an auth cookie`);
    }
    assert.equal(refreshed, 0, "no token refresh may run on a sign-out request");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("ROOT CAUSE 2 (old flow replay): a one-scope action delete leaves the session alive", () => {
  const jar = signedInJar();
  // Server action: name-keyed jar expires only the canonical scope.
  jarSet(jar, "app.staging.tulala.digital", `${AUTH}=; Path=/; Max-Age=0; Domain=.tulala.digital`);
  // The follow-up location.assign hop did not run (QA 9:33 first click).
  assert.ok(jarCookies(jar, "app.staging.tulala.digital").length > 0, "old flow leaves a copy behind");
});

test("FIX: one POST /auth/sign-out clears every scope on both hosts, no-store, no re-mint", () => withStubFetch(async () => {
  const { POST } = await import("@/app/auth/sign-out/route");
  const jar = signedInJar();
  for (const host of ["app.staging.tulala.digital", "book-sofia.staging.tulala.digital"]) {
    const res = await POST(
      new Request(`https://${host}${host.startsWith("app") ? SIGN_OUT_PATH : CLIENT_SIGN_OUT_PATH}`, {
        method: "POST",
        headers: { host, cookie: jarCookies(jar, host).join("; "), "sec-fetch-site": "same-origin" },
      }),
    );
    assert.equal(res.status, 303);
    assert.match(res.headers.get("cache-control") ?? "", /no-store/);
    for (const h of res.headers.getSetCookie()) jarSet(jar, host, h);
  }
  // Reload both subdomains: nothing auth-related is sent anywhere.
  for (const host of ["app.staging.tulala.digital", "book-sofia.staging.tulala.digital", "staging.tulala.digital"]) {
    assert.deepEqual(jarCookies(jar, host).filter((c) => c.startsWith("sb-")), [], host);
  }
}));

test("FIX: the own project cookie is expired at every scope even when the request did not send it", async () => {
  const { POST } = await import("@/app/auth/sign-out/route");
  const res = await POST(
    new Request(`https://app.staging.tulala.digital${SIGN_OUT_PATH}`, {
      method: "POST",
      headers: { host: "app.staging.tulala.digital", "sec-fetch-site": "same-origin" },
    }),
  );
  const set = res.headers.getSetCookie();
  for (const d of [".app.staging.tulala.digital", ".staging.tulala.digital", ".tulala.digital"]) {
    assert.ok(set.includes(`${AUTH}=; Path=/; Max-Age=0; Domain=${d}`), d);
  }
  assert.ok(set.includes(`${AUTH}.0=; Path=/; Max-Age=0`));
});

test("FIX: a cross-site POST cannot sign the user out", async () => {
  const { POST } = await import("@/app/auth/sign-out/route");
  const res = await POST(
    new Request(`https://app.staging.tulala.digital${SIGN_OUT_PATH}`, {
      method: "POST",
      headers: { host: "app.staging.tulala.digital", cookie: `${AUTH}=x`, "sec-fetch-site": "cross-site" },
    }),
  );
  assert.deepEqual(res.headers.getSetCookie(), []);
});

test("sign-out and session pages are classified for no-store", () => {
  assert.ok(isSignOutPath(SIGN_OUT_PATH) && isSignOutPath(CLIENT_SIGN_OUT_PATH));
  for (const p of ["/login", "/es/login", "/account", "/account/settings", SIGN_OUT_PATH]) {
    assert.ok(isSessionSensitivePage(p), p);
  }
  assert.ok(!isSessionSensitivePage("/accounting"));
});

test("every Log out entry point uses the single sign-out (no server action, no router.refresh)", () => {
  const declarative = [
    "app/(workspace)/platform/admin/layout.tsx",
    "app/(workspace)/[tenantSlug]/admin/_real-identity-banner.tsx",
    "components/public-header.tsx",
    "components/public-header-mobile-menu.tsx",
    "components/account-menu.tsx",
    "components/marketing/marketing-account-menu.tsx",
  ];
  for (const f of declarative) {
    const s = read(f);
    assert.match(s, /<SignOutForm/, f);
    assert.doesNotMatch(s, /<form action=\{signOut(Action)?\}/, f);
  }
  const imperative = [
    "app/(workspace)/[tenantSlug]/client/_components/ClientAccountMenu.tsx",
    "components/admin/shell/internal/page-modules/IdentityBar-1.tsx",
    "components/talent/studio/MoreScreen.tsx",
    "components/client-account/AccountClientIslands.tsx",
    "components/client-account/ClientAccountButton.tsx",
  ];
  for (const f of imperative) {
    const s = read(f);
    assert.match(s, /signOutEverywhere\(/, f);
    assert.doesNotMatch(s, /await signOut\(\)|signOutClientAccount\(\)/, f);
  }
  const helper = read("lib/auth/sign-out-client.ts");
  assert.match(helper, /stopBrowserAuthClient\(\)/);
  assert.match(helper, /localStorage/);
  assert.match(helper, /form\.submit\(\)/);
  assert.match(read("lib/supabase/middleware.ts"), /if \(isSignOutPath\(pathnameForAuth\)\)/);
});

test("CI dev-signin flow: the proxy auth-scope sweep never drops or expires a fresh sign-in cookie on localhost", async () => {
  const { appendAuthScopeSweep } = await import("@/lib/supabase/auth-scope-sweep");
  const { NextResponse } = await import("next/server");
  for (const host of ["localhost:3000", "acme.lvh.me:3000"]) {
    const req = new NextRequest(`http://${host}/api/dev/signin?email=qa%40impronta.test&next=%2F`, {
      headers: { host, cookie: "impronta_guest=g" },
    });
    const res = NextResponse.redirect(new URL("/", req.url), 307);
    res.cookies.set(AUTH, session(FUTURE), { path: "/", sameSite: "lax" });
    const out = appendAuthScopeSweep(req, res);
    const set = out.headers.getSetCookie();
    assert.equal(out.status, 307, host);
    assert.ok(set.some((h) => h.startsWith(`${AUTH}=base64-`)), `${host}: sign-in cookie kept`);
    assert.ok(!set.some((h) => /Max-Age=0/i.test(h)), `${host}: nothing expired on a single-copy sign-in`);
  }
});
