import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { frontDoorUrl, intentFromLegacyParams, intentFromStartParam } from "./front-door";

describe("one front door", () => {
  test("legacy params map to an intent", () => {
    assert.equal(intentFromLegacyParams({ tier: "studio" }), "business");
    assert.equal(intentFromLegacyParams({ tier: "free" }), "business");
    assert.equal(intentFromLegacyParams({ tier: "talent_pro" }), "talent");
    assert.equal(intentFromLegacyParams({ audience: "talent" }), "talent");
    assert.equal(intentFromLegacyParams({ intent: "talent", tier: "agency" }), "talent");
    assert.equal(intentFromLegacyParams({}), "unknown");
  });

  test("front door URL carries intent and a sane promo only", () => {
    assert.equal(frontDoorUrl("business"), "/?start=business");
    assert.equal(frontDoorUrl("talent", { promo: "SUMMER25", locale: "es" }), "/es?start=talent&promo=SUMMER25");
    assert.equal(frontDoorUrl("unknown", { promo: "<script>" }), "/?start=unknown");
  });

  test("start param parsing", () => {
    assert.equal(intentFromStartParam("talent"), "talent");
    assert.equal(intentFromStartParam("1"), "unknown");
    assert.equal(intentFromStartParam("nope"), null);
    assert.equal(intentFromStartParam(null), null);
  });
});
