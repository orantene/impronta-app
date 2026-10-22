import assert from "node:assert/strict";
import { test } from "node:test";

import { fakeAdmin, uuid } from "@/lib/storefront/__fixtures__/fake-admin";

import { permissionsTable, type PermissionRow } from "@/lib/staff-permissions/__fixtures__/fake-permissions-table";

import { hasMessagingMoneyPermission } from "./money-permissions";

const TENANT = uuid(1);
const STAFF_A = uuid(2);
const STAFF_B = uuid(3);
const SUPER_ADMIN = uuid(4);
const OTHER_TENANT_STAFF = uuid(5);

function seed(overrides: Partial<{ staffPermissions: Array<Record<string, unknown>>; profiles: Array<Record<string, unknown>> }> = {}) {
  return fakeAdmin({
    profiles: overrides.profiles ?? [
      { id: STAFF_A, app_role: "agency_staff" },
      { id: STAFF_B, app_role: "agency_staff" },
      { id: SUPER_ADMIN, app_role: "super_admin" },
      { id: OTHER_TENANT_STAFF, app_role: "agency_staff" },
    ],
    agency_memberships: [
      { tenant_id: TENANT, profile_id: STAFF_A, status: "active" },
      { tenant_id: TENANT, profile_id: STAFF_B, status: "active" },
      { tenant_id: uuid(99), profile_id: OTHER_TENANT_STAFF, status: "active" },
    ],
    // TUL-1813: rows are per-tenant now; default to the grantee's own tenant.
    staff_permissions: (overrides.staffPermissions ?? []).map((r) => ({
      tenant_id: r.user_id === OTHER_TENANT_STAFF ? uuid(99) : TENANT,
      ...r,
    })),
  });
}

test("unconfigured tenant (no rows for this key): every staff member passes", async () => {
  const { admin } = seed();
  const a = await hasMessagingMoneyPermission(admin, { tenantId: TENANT, userId: STAFF_A, permission: "messages.cancel" });
  const b = await hasMessagingMoneyPermission(admin, { tenantId: TENANT, userId: STAFF_B, permission: "messages.cancel" });
  assert.equal(a, true);
  assert.equal(b, true);
});

test("tenant opts in: only the granted holder passes, the rest of staff are refused", async () => {
  const { admin } = seed({ staffPermissions: [{ user_id: STAFF_A, permission: "messages.cancel" }] });
  const holder = await hasMessagingMoneyPermission(admin, { tenantId: TENANT, userId: STAFF_A, permission: "messages.cancel" });
  const nonHolder = await hasMessagingMoneyPermission(admin, { tenantId: TENANT, userId: STAFF_B, permission: "messages.cancel" });
  assert.equal(holder, true);
  assert.equal(nonHolder, false);
});

test("a grant for a DIFFERENT key does not open or close messages.cancel", async () => {
  const { admin } = seed({ staffPermissions: [{ user_id: STAFF_A, permission: "messages.refund" }] });
  const a = await hasMessagingMoneyPermission(admin, { tenantId: TENANT, userId: STAFF_A, permission: "messages.cancel" });
  assert.equal(a, true, "messages.cancel is still unconfigured for this tenant, so it stays open");
});

test("super_admin always passes, even on a tenant that has opted in and excluded them", async () => {
  const { admin } = seed({ staffPermissions: [{ user_id: STAFF_A, permission: "messages.cancel" }] });
  const admin_ = await hasMessagingMoneyPermission(admin, { tenantId: TENANT, userId: SUPER_ADMIN, permission: "messages.cancel" });
  assert.equal(admin_, true);
});

test("a grant held by staff of ANOTHER tenant does not open this tenant's key", async () => {
  const { admin } = seed({ staffPermissions: [{ user_id: OTHER_TENANT_STAFF, permission: "messages.cancel" }] });
  // This tenant (TENANT) has no active staff holding the key — its own
  // roster is unaffected by a grant recorded against a different tenant's
  // staff member, so it stays unconfigured (open) for TENANT.
  const a = await hasMessagingMoneyPermission(admin, { tenantId: TENANT, userId: STAFF_A, permission: "messages.cancel" });
  assert.equal(a, true);
});

test("a user with no active membership on the tenant is refused even when the key is unconfigured", async () => {
  const { admin } = seed();
  const stranger = uuid(77);
  const result = await hasMessagingMoneyPermission(admin, { tenantId: TENANT, userId: stranger, permission: "messages.cancel" });
  assert.equal(result, false);
});

// ---- TUL-1813: per-tenant scope, both table shapes ------------------------

const TENANT_B = uuid(98);

function seedShape(shape: "legacy" | "scoped", rows: PermissionRow[]) {
  const base = fakeAdmin({
    profiles: [{ id: STAFF_A, app_role: "agency_staff" }, { id: STAFF_B, app_role: "agency_staff" }],
    agency_memberships: [
      { tenant_id: TENANT, profile_id: STAFF_A, status: "active" },
      { tenant_id: TENANT, profile_id: STAFF_B, status: "active" },
      { tenant_id: TENANT_B, profile_id: STAFF_A, status: "active" },
      { tenant_id: TENANT_B, profile_id: STAFF_B, status: "active" },
    ],
  });
  const { table } = permissionsTable(shape, rows);
  return { from: (t: string) => (t === "staff_permissions" ? table.from(t) : base.admin.from(t)) };
}

test("scoped shape: a grant in tenant A does NOT configure or restrict tenant B", async () => {
  const admin = seedShape("scoped", [{ user_id: STAFF_A, tenant_id: TENANT, permission: "messages.refund" }]);
  const aHolder = await hasMessagingMoneyPermission(admin, { tenantId: TENANT, userId: STAFF_A, permission: "messages.refund" });
  const aOther = await hasMessagingMoneyPermission(admin, { tenantId: TENANT, userId: STAFF_B, permission: "messages.refund" });
  const bOther = await hasMessagingMoneyPermission(admin, { tenantId: TENANT_B, userId: STAFF_B, permission: "messages.refund" });
  assert.equal(aHolder, true);
  assert.equal(aOther, false, "tenant A is configured: non-holder refused");
  assert.equal(bOther, true, "tenant B stays unconfigured/open");
});

test("scoped shape: one user holding the key in two tenants (multiplied rows) does not error", async () => {
  const admin = seedShape("scoped", [
    { user_id: STAFF_A, tenant_id: TENANT, permission: "messages.refund" },
    { user_id: STAFF_A, tenant_id: TENANT_B, permission: "messages.refund" },
  ]);
  assert.equal(await hasMessagingMoneyPermission(admin, { tenantId: TENANT, userId: STAFF_A, permission: "messages.refund" }), true);
  assert.equal(await hasMessagingMoneyPermission(admin, { tenantId: TENANT_B, userId: STAFF_B, permission: "messages.refund" }), false);
});

test("legacy shape (column absent): keeps working with the pre-migration behaviour", async () => {
  const admin = seedShape("legacy", [{ user_id: STAFF_A, permission: "messages.refund" }]);
  assert.equal(await hasMessagingMoneyPermission(admin, { tenantId: TENANT, userId: STAFF_A, permission: "messages.refund" }), true);
  assert.equal(await hasMessagingMoneyPermission(admin, { tenantId: TENANT, userId: STAFF_B, permission: "messages.refund" }), false);
});
