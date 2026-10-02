import assert from "node:assert/strict";
import { test } from "node:test";

import { isPlatformHubRow } from "./client-link";

test("the production platform hub (slug tulala) is recognised by kind + plan", () => {
  assert.equal(isPlatformHubRow({ slug: "tulala", kind: "hub", plan_tier: "network" }), true);
});

test("legacy slug hub still matches; an agency or a non-network hub does not", () => {
  assert.equal(isPlatformHubRow({ slug: "hub" }), true);
  assert.equal(isPlatformHubRow({ slug: "impronta", kind: "agency", plan_tier: "pro" }), false);
  assert.equal(isPlatformHubRow({ slug: "cancun-hub", kind: "hub", plan_tier: "pro" }), false);
  assert.equal(isPlatformHubRow(null), false);
});
