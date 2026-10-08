import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { shouldCelebratePlan } from "./upgrade-celebration-gate";

describe("shouldCelebratePlan", () => {
  it("never welcomes a solo talent to Network, Agency or Studio", () => {
    assert.equal(shouldCelebratePlan("website", "network", "talent"), false);
    assert.equal(shouldCelebratePlan("free", "agency", "talent"), false);
  });
  it("still welcomes a talent to Web Office and a workspace to Network", () => {
    assert.equal(shouldCelebratePlan("free", "website", "talent"), true);
    assert.equal(shouldCelebratePlan("agency", "network", "workspace"), true);
  });
  it("ignores first sight, same plan and downgrades", () => {
    assert.equal(shouldCelebratePlan(null, "network", "workspace"), false);
    assert.equal(shouldCelebratePlan("network", "network", "workspace"), false);
    assert.equal(shouldCelebratePlan("network", "agency", "workspace"), false);
  });
});
