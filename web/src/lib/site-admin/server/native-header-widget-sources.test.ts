/**
 * native-header-widget-sources.test.ts — BUILDER 2027 · P2B.
 *
 * Two properties, both of which have broken in production before:
 *
 *   1. HOST SAFETY. `/admin`, `/talent` and `/client` do not exist on a tenant
 *      storefront host. An account href that skips `hostSafeDestination` is a
 *      404 on every agency domain while looking perfectly correct in a unit
 *      test — so the transform is injected here and the test asserts it was
 *      actually applied, not merely available.
 *   2. A signed-out visitor is never handed a dashboard path.
 *
 * Runner: `tsx --test`, reached by `test:builder`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { deriveNativeAccountWidget } from "./native-header-widget-sources";

/** Stand-in for `hostSafeDestination(href, "tenant")`. */
const absolutise = (href: string) =>
  href.startsWith("/login") ? href : `https://app.example.test${href}`;

test("a signed-out visitor gets the sign-in route, never a dashboard", () => {
  const account = deriveNativeAccountWidget({
    signedIn: false,
    profile: null,
    makeHostSafe: absolutise,
  });
  assert.equal(account.signedIn, false);
  assert.equal(account.href, "/login");
  assert.equal(
    account.displayName,
    undefined,
    "a signed-out chip must not carry a name",
  );
});

test("a signed-in talent is sent to their own dashboard, host-safely", () => {
  const account = deriveNativeAccountWidget({
    signedIn: true,
    profile: {
      app_role: "talent",
      account_status: "active",
      display_name: "Ana",
    },
    makeHostSafe: absolutise,
  });
  assert.equal(account.signedIn, true);
  assert.equal(
    account.href,
    "https://app.example.test/talent",
    "a RELATIVE /talent here is a 404 on every agency host",
  );
  assert.equal(account.displayName, "Ana");
});

test("the host-safe transform is applied, not merely available", () => {
  // The regression this catches: someone resolves the href correctly and then
  // returns it raw. Recording the calls proves the transform ran on the value
  // that was actually returned.
  const seen: string[] = [];
  const account = deriveNativeAccountWidget({
    signedIn: true,
    profile: { app_role: "agency_staff", account_status: "active" },
    makeHostSafe: (href) => {
      seen.push(href);
      return `SAFE(${href})`;
    },
  });
  assert.deepEqual(seen, ["/admin"]);
  assert.equal(account.href, "SAFE(/admin)");
});

test("a half-onboarded account is not greeted by name", () => {
  const account = deriveNativeAccountWidget({
    signedIn: true,
    profile: {
      app_role: "talent",
      account_status: "onboarding",
      display_name: "Ana",
    },
    makeHostSafe: absolutise,
  });
  assert.equal(
    account.displayName,
    undefined,
    "naming someone who cannot use their account yet reads as a working account",
  );
  assert.equal(
    account.href,
    "https://app.example.test/onboarding/role",
    "…and is sent to finish onboarding rather than to a dashboard",
  );
});

test("a blank display name does not produce an empty label", () => {
  const account = deriveNativeAccountWidget({
    signedIn: true,
    profile: {
      app_role: "client",
      account_status: "active",
      display_name: "   ",
    },
    makeHostSafe: absolutise,
  });
  assert.equal(account.displayName, undefined);
});
