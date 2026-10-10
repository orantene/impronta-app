import assert from "node:assert/strict";
import { test } from "node:test";

import { decideAccountTenantSource } from "./tenant-source";

const T = "11111111-1111-4111-8111-111111111111";

test("talent host uses the talent tenant and the talent flag", () => {
  assert.deepEqual(decideAccountTenantSource({ hostKind: "talent_site", talentProfileId: "p1", hostTenantId: T }), {
    source: "talent_profile",
    flag: "talent",
  });
});
test("talent host without a profile header fails closed", () => {
  assert.equal(decideAccountTenantSource({ hostKind: "talent_site", talentProfileId: null, hostTenantId: T }), null);
});
test("hub and agency hosts use the host tenant and their own flag kind (TUL-64)", () => {
  assert.deepEqual(decideAccountTenantSource({ hostKind: "agency", talentProfileId: "p1", hostTenantId: T }), {
    source: "host_tenant",
    flag: "agency",
  });
  assert.deepEqual(decideAccountTenantSource({ hostKind: "hub", talentProfileId: "p1", hostTenantId: T }), {
    source: "host_tenant",
    flag: "hub",
  });
});
test("hub or agency host with a missing or malformed tenant fails closed", () => {
  assert.equal(decideAccountTenantSource({ hostKind: "hub", talentProfileId: null, hostTenantId: null }), null);
  assert.equal(decideAccountTenantSource({ hostKind: "agency", talentProfileId: null, hostTenantId: "nope" }), null);
});
test("app and marketing apex hosts use the platform hub tenant and their own flag", () => {
  assert.deepEqual(decideAccountTenantSource({ hostKind: "app", talentProfileId: "p1", hostTenantId: T }), {
    source: "platform_hub",
    flag: "app",
  });
  assert.deepEqual(decideAccountTenantSource({ hostKind: "marketing", talentProfileId: "p1", hostTenantId: T }), {
    source: "platform_hub",
    flag: "marketing",
  });
});
test("not_found and unknown hosts fail closed", () => {
  for (const hostKind of ["not_found", "weird", null]) {
    assert.equal(decideAccountTenantSource({ hostKind, talentProfileId: "p1", hostTenantId: T }), null);
  }
});
