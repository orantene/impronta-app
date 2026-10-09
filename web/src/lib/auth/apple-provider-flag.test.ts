import assert from "node:assert/strict";
import test from "node:test";

import { isAppleAuthProviderEnabled } from "./apple-provider-flag";

test("Apple provider flag is off when unset or empty", () => {
  assert.equal(isAppleAuthProviderEnabled({}), false);
  assert.equal(isAppleAuthProviderEnabled({ AUTH_APPLE_PROVIDER_ENABLED: "" }), false);
  assert.equal(isAppleAuthProviderEnabled({ AUTH_APPLE_PROVIDER_ENABLED: "  " }), false);
});

test("Apple provider flag accepts explicit truthy tokens only", () => {
  for (const v of ["1", "true", "TRUE", "on", "yes", " Yes "]) {
    assert.equal(isAppleAuthProviderEnabled({ AUTH_APPLE_PROVIDER_ENABLED: v }), true, v);
  }
  for (const v of ["0", "false", "off", "no", "enabled", "apple"]) {
    assert.equal(isAppleAuthProviderEnabled({ AUTH_APPLE_PROVIDER_ENABLED: v }), false, v);
  }
});
