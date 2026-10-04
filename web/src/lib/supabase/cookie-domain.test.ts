import assert from "node:assert/strict";
import { test } from "node:test";

import {
  cookieDomainForHost,
  expireParentDomainAuthCookies,
  isSupabaseAuthCookie,
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
