import assert from "node:assert/strict";
import { test } from "node:test";

import { signTalentOfferingIntent, verifyTalentOfferingIntent } from "./talent-offering-intent";

test("a signed service choice verifies, and a swapped offering id does not", () => {
  const prev = process.env.GUEST_COOKIE_SECRET;
  process.env.GUEST_COOKIE_SECRET = "test-secret-for-pos-messages";
  try {
    const token = signTalentOfferingIntent({
      profileId: "profile-1",
      offeringId: "offering-1",
      variantId: "variant-3",
      addonIds: ["addon-ojo"],
      intent: "reserve",
    }, 1_000);
    assert.ok(token);
    const ok = verifyTalentOfferingIntent(token!, 1_000);
    assert.equal(ok.ok, true);
    if (ok.ok) {
      assert.equal(ok.payload.offering, "offering-1");
      assert.equal(ok.payload.variant, "variant-3");
      assert.deepEqual(ok.payload.addons, ["addon-ojo"]);
      assert.equal(ok.payload.intent, "reserve");
      assert.equal("price" in ok.payload, false);
      assert.equal("tenant" in ok.payload, false);
    }
    const [, encoded, sig] = token!.split(".");
    const forged = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as { offering: string };
    forged.offering = "offering-other";
    const forgedEncoded = Buffer.from(JSON.stringify(forged), "utf8").toString("base64url");
    assert.equal(verifyTalentOfferingIntent(`v1.${forgedEncoded}.${sig}`, 1_000).ok, false);
  } finally {
    process.env.GUEST_COOKIE_SECRET = prev;
  }
});

test("an expired choice is refused", () => {
  const prev = process.env.GUEST_COOKIE_SECRET;
  process.env.GUEST_COOKIE_SECRET = "test-secret-for-pos-messages";
  try {
    const token = signTalentOfferingIntent({
      profileId: "profile-1",
      offeringId: "offering-1",
      intent: "ask",
    }, 1_000);
    assert.ok(token);
    const expired = verifyTalentOfferingIntent(token!, 1_000 + 31 * 60 * 1000);
    assert.equal(expired.ok, false);
    if (!expired.ok) assert.equal(expired.reason, "expired");
  } finally {
    process.env.GUEST_COOKIE_SECRET = prev;
  }
});
