import test from "node:test";
import assert from "node:assert/strict";
import { pickTalentTenant } from "./talent-self-tenant";

test("non-rostered agency host is not used", () => {
  assert.equal(pickTalentTenant({ scopeTenantId: "X", rosterTenantIds: ["A"] }), "A");
  assert.equal(pickTalentTenant({ scopeTenantId: "X", rosterTenantIds: [] }), null);
});
test("rostered host tenant is used", () => {
  assert.equal(pickTalentTenant({ scopeTenantId: "B", rosterTenantIds: ["A", "B"] }), "B");
});
test("no scope: first roster; none: null", () => {
  assert.equal(pickTalentTenant({ scopeTenantId: null, rosterTenantIds: ["A", "B"] }), "A");
  assert.equal(pickTalentTenant({ scopeTenantId: null, rosterTenantIds: [] }), null);
});
test("roster query error never yields the host tenant", () => {
  assert.equal(pickTalentTenant({ scopeTenantId: "X", rosterTenantIds: null }), null);
});
