import assert from "node:assert/strict";
import { test } from "node:test";

import { verifyTalentOfferingIntent } from "@/lib/messaging/talent-offering-intent";

import { promoServiceHref } from "./service-link";

const PROFILE = "11111111-1111-4111-8111-111111111111";
const SERVICE = "22222222-2222-4222-8222-222222222222";
const NOW = Date.parse("2026-10-14T18:00:00Z");

function withSecret<T>(value: string | undefined, fn: () => T): T {
  const prev = process.env.GUEST_COOKIE_SECRET;
  if (value === undefined) delete process.env.GUEST_COOKIE_SECRET;
  else process.env.GUEST_COOKIE_SECRET = value;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.GUEST_COOKIE_SECRET;
    else process.env.GUEST_COOKIE_SECRET = prev;
  }
}

test("the landing CTA carries a signed choice the talent site verifies, never the raw id", () => {
  withSecret("test-secret", () => {
    const href = promoServiceHref("/t/TAL-1", { profileId: PROFILE, serviceId: SERVICE }, NOW);
    const token = new URL(href, "https://x.test").searchParams.get("service");
    assert.ok(token);
    assert.notEqual(token, SERVICE);
    const v = verifyTalentOfferingIntent(token, NOW + 1000);
    assert.equal(v.ok, true);
    if (v.ok) {
      assert.equal(v.payload.profile, PROFILE);
      assert.equal(v.payload.offering, SERVICE);
    }
    // The raw id the old link sent is refused by the same verifier.
    assert.equal(verifyTalentOfferingIntent(SERVICE, NOW).ok, false);
  });
});

test("an existing query string is extended, not replaced", () => {
  withSecret("test-secret", () => {
    const href = promoServiceHref("/?lang=es", { profileId: PROFILE, serviceId: SERVICE }, NOW);
    assert.match(href, /^\/\?lang=es&service=/);
  });
});

test("no secret or no profile: fall back to the home link", () => {
  withSecret(undefined, () => {
    assert.equal(promoServiceHref("/t/TAL-1", { profileId: PROFILE, serviceId: SERVICE }, NOW), "/t/TAL-1");
  });
  withSecret("test-secret", () => {
    assert.equal(promoServiceHref("/t/TAL-1", { profileId: null, serviceId: SERVICE }, NOW), "/t/TAL-1");
  });
});
