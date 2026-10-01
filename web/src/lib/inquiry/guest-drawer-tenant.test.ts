import assert from "node:assert/strict";
import { test } from "node:test";

import { guestDrawerFallbackAllowed, isPublicTenantStatus } from "./guest-drawer-tenant";

test("anonymous guest naming a talent may use the public tenant fallback", () => {
  assert.equal(guestDrawerFallbackAllowed({ hasUser: false, selectedTalentIds: ["f048e578"] }), true);
});

test("a signed-in caller never uses the fallback (relationship scope stays authoritative)", () => {
  assert.equal(guestDrawerFallbackAllowed({ hasUser: true, selectedTalentIds: ["f048e578"] }), false);
});

test("a talent-less guest inquiry has no roster gate, so no fallback", () => {
  assert.equal(guestDrawerFallbackAllowed({ hasUser: false, selectedTalentIds: [] }), false);
  assert.equal(guestDrawerFallbackAllowed({ hasUser: false, selectedTalentIds: null }), false);
  assert.equal(guestDrawerFallbackAllowed({ hasUser: false, selectedTalentIds: ["", "  ", 7] }), false);
});

test("closed tenants are not public targets", () => {
  assert.equal(isPublicTenantStatus("active"), true);
  assert.equal(isPublicTenantStatus(null), true);
  assert.equal(isPublicTenantStatus("cancelled"), false);
  assert.equal(isPublicTenantStatus("archived"), false);
});
