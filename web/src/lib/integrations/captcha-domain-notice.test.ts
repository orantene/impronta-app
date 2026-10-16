import { test } from "node:test";
import assert from "node:assert/strict";
import { captchaNoticeDomain } from "./captcha-domain-notice";

const none = { provider: null, siteKey: null };
const env = {};

test("live custom domain + no own captcha -> notice names the domain (primary first)", () => {
  const d = captchaNoticeDomain({
    domains: [
      { hostname: "b.com", kind: "custom", status: "active" },
      { hostname: "Maria-Nails.com", kind: "custom", status: "verified", is_primary: true },
    ],
    ownCaptcha: none,
    env,
  });
  assert.equal(d, "maria-nails.com");
});

test("own usable captcha -> no notice", () => {
  const d = captchaNoticeDomain({
    domains: [{ hostname: "maria-nails.com", kind: "custom", status: "active" }],
    ownCaptcha: { provider: "turnstile", siteKey: "0x4AAA" },
    env,
  });
  assert.equal(d, null);
});

test("subdomains, pending domains and platform-covered hosts -> no notice", () => {
  const d = captchaNoticeDomain({
    domains: [
      { hostname: "maria.tulala.digital", kind: "subdomain", status: "active" },
      { hostname: "pending.com", kind: "custom", status: "pending" },
      { hostname: "impronta.mx", kind: "custom", status: "active" },
    ],
    ownCaptcha: none,
    env: { TURNSTILE_PLATFORM_HOSTS: "impronta.mx" },
  });
  assert.equal(d, null);
});
