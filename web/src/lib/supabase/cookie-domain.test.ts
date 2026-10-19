import assert from "node:assert/strict";
import { test } from "node:test";

import {
  authCookieExpiryHeaders,
  cookieDomainForHost,
  expireParentDomainAuthCookies,
  isSupabaseAuthCookie,
  scopeAuthCookieOptions,
} from "./cookie-domain";

test("shared parent for marketing / app / tenant subdomains", () => {
  assert.equal(cookieDomainForHost("tulala.digital"), ".tulala.digital");
  assert.equal(cookieDomainForHost("app.tulala.digital"), ".tulala.digital");
  assert.equal(cookieDomainForHost("impronta.tulala.digital"), ".tulala.digital");
  assert.equal(cookieDomainForHost("app.lvh.me"), ".lvh.me");
});

test("Support Desk hosts stay host-scoped (never .tulala.digital)", () => {
  assert.equal(cookieDomainForHost("support.tulala.digital"), undefined);
  assert.equal(cookieDomainForHost("desk.tulala.digital"), undefined);
  assert.equal(cookieDomainForHost("SUPPORT.tulala.digital:443"), undefined);
});

test("localhost / custom / vercel stay host-only", () => {
  assert.equal(cookieDomainForHost("localhost"), undefined);
  assert.equal(cookieDomainForHost("127.0.0.1"), undefined);
  assert.equal(cookieDomainForHost("improntamodels.com"), undefined);
  assert.equal(cookieDomainForHost("tulala-abc.vercel.app"), undefined);
});

test("isSupabaseAuthCookie matches auth-token / code-verifier only", () => {
  assert.equal(isSupabaseAuthCookie("sb-xyz-auth-token"), true);
  assert.equal(isSupabaseAuthCookie("sb-xyz-auth-token.0"), true);
  assert.equal(isSupabaseAuthCookie("sb-xyz-code-verifier"), true);
  assert.equal(isSupabaseAuthCookie("sb-xyz-other"), false);
  assert.equal(isSupabaseAuthCookie("guest"), false);
});

test("expireParentDomainAuthCookies clears shared parents for auth names only", () => {
  const calls: Array<{ name: string; domain?: string }> = [];
  expireParentDomainAuthCookies(
    {
      set(name, _value, options) {
        calls.push({ name, domain: options?.domain });
      },
    },
    ["sb-xyz-auth-token", "guest", "sb-xyz-code-verifier"],
  );
  assert.deepEqual(
    calls.map((c) => `${c.name}@${c.domain}`).sort(),
    [
      "sb-xyz-auth-token@.lvh.me",
      "sb-xyz-auth-token@.tulala.digital",
      "sb-xyz-code-verifier@.lvh.me",
      "sb-xyz-code-verifier@.tulala.digital",
    ],
  );
});

test("authCookieExpiryHeaders expires host-only and parent scope on shared hosts", () => {
  const h = authCookieExpiryHeaders(["sb-x-auth-token", "sb-x-auth-token.0", "other"], "tulala.digital");
  // TUL-708: every chunk (.0-.4) of the base name, at both scopes.
  assert.equal(h.length, 12);
  assert.ok(h.includes("sb-x-auth-token=; Path=/; Max-Age=0"));
  assert.ok(h.includes("sb-x-auth-token.0=; Path=/; Max-Age=0; Domain=.tulala.digital"));
  assert.ok(!h.some((x) => x.startsWith("other=")));
});

test("authCookieExpiryHeaders is host-only on localhost", () => {
  const h = authCookieExpiryHeaders(["sb-x-auth-token"], "localhost:3000");
  assert.ok(h.includes("sb-x-auth-token=; Path=/; Max-Age=0"));
  assert.ok(h.every((x) => !x.includes("Domain=")));
});

test("TUL-757: scopeAuthCookieOptions is the one shared-Domain decision", async () => {
  assert.deepEqual(scopeAuthCookieOptions("sb-x-auth-token", { path: "/" }, ".tulala.digital"), { path: "/", domain: ".tulala.digital" });
  assert.deepEqual(scopeAuthCookieOptions("sb-x-auth-token", { path: "/" }, undefined), { path: "/" });
  assert.deepEqual(scopeAuthCookieOptions("guest", { path: "/" }, ".tulala.digital"), { path: "/" });
  assert.deepEqual(scopeAuthCookieOptions("sb-x-auth-token", undefined, ".tulala.digital"), { domain: ".tulala.digital" });
  // No server-side writer repeats the ternary any more.
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  for (const rel of ["src/lib/supabase/server.ts", "src/lib/supabase/middleware.ts", "src/app/auth/callback/route.ts", "src/app/auth/google/route.ts", "src/app/auth/apple/route.ts"]) {
    const src = readFileSync(join(process.cwd(), rel), "utf8");
    assert.match(src, /scopeAuthCookieOptions\(/, rel);
    assert.doesNotMatch(src, /authCookieDomain && isSupabaseAuthCookie/, rel);
  }
});
