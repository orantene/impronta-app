import assert from "node:assert/strict";
import test from "node:test";

import { decideLibraryTenant } from "./library-tenant-decision";

const WS = "a07179ce-02b0-425d-8300-05b9094b01a9";
const OTHER = "11111111-1111-4111-8111-111111111111";

test("scope equals requested tenant: accepted without needing memberships", () => {
  const d = decideLibraryTenant({
    requestedTenantId: WS,
    scopeTenantId: WS,
    memberships: [],
  });
  assert.deepEqual(d, { ok: true, tenantId: WS, via: "scope" });
});

test("stale switcher cookie / default scope on another tenant: member of requested tenant is accepted (old route returned 403)", () => {
  const d = decideLibraryTenant({
    requestedTenantId: WS,
    scopeTenantId: OTHER,
    memberships: [
      { tenant_id: OTHER, status: "active" },
      { tenant_id: WS, status: "active" },
    ],
  });
  assert.equal(d.ok, true);
  if (d.ok) assert.equal(d.via, "membership");
});

test("no resolvable scope but active membership of requested tenant: accepted (old route returned 400)", () => {
  const d = decideLibraryTenant({
    requestedTenantId: WS,
    scopeTenantId: null,
    memberships: [{ tenant_id: WS, status: "active" }],
  });
  assert.equal(d.ok, true);
});

test("non-member is refused: never a downgrade to another workspace", () => {
  const d = decideLibraryTenant({
    requestedTenantId: WS,
    scopeTenantId: OTHER,
    memberships: [{ tenant_id: OTHER, status: "active" }],
  });
  assert.equal(d.ok, false);
  if (!d.ok) {
    assert.equal(d.status, 403);
    assert.equal(d.reason, "tenant-mismatch");
  }
});

test("invited or removed membership does not grant access", () => {
  for (const status of ["invited", "removed", "suspended"] as const) {
    const d = decideLibraryTenant({
      requestedTenantId: WS,
      scopeTenantId: OTHER,
      memberships: [{ tenant_id: WS, status: status as never }],
    });
    assert.equal(d.ok, false, status);
  }
});

test("failure classes stay distinguishable for the server log", () => {
  const none = decideLibraryTenant({
    requestedTenantId: WS,
    scopeTenantId: null,
    memberships: [],
  });
  assert.ok(!none.ok && none.reason === "no-scope" && none.status === 400);
  const missing = decideLibraryTenant({
    requestedTenantId: null,
    scopeTenantId: WS,
    memberships: [],
  });
  assert.ok(!missing.ok && missing.reason === "no-requested-tenant");
});
