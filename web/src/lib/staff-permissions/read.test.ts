import assert from "node:assert/strict";
import { test } from "node:test";

import { permissionsTable, type PermissionRow } from "./__fixtures__/fake-permissions-table";
import { selectStaffPermissions } from "./read";

const TENANT_A = "00000000-0000-4000-8000-00000000000a";
const TENANT_B = "00000000-0000-4000-8000-00000000000b";
const USER = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";

const MULTI: PermissionRow[] = [
  { user_id: USER, tenant_id: TENANT_A, permission: "messages.refund" },
  { user_id: USER, tenant_id: TENANT_B, permission: "messages.cancel" },
  { user_id: OTHER, tenant_id: TENANT_B, permission: "messages.refund" },
];

test("scoped shape: a grant in tenant A is not returned for tenant B", async () => {
  const { table } = permissionsTable("scoped", MULTI);
  const a = await selectStaffPermissions(table, { tenantId: TENANT_A, userIds: [USER, OTHER] });
  const b = await selectStaffPermissions(table, { tenantId: TENANT_B, userIds: [USER, OTHER] });
  assert.deepEqual(a.rows.map((r) => `${r.user_id}:${r.permission}`), [`${USER}:messages.refund`]);
  assert.deepEqual(b.rows.map((r) => `${r.user_id}:${r.permission}`).sort(), [
    `${USER}:messages.cancel`,
    `${OTHER}:messages.refund`,
  ]);
});

test("scoped shape: permission filter + multiple rows for one user do not error (no single-row read)", async () => {
  const { table } = permissionsTable("scoped", [
    { user_id: USER, tenant_id: TENANT_A, permission: "messages.refund" },
    { user_id: USER, tenant_id: TENANT_B, permission: "messages.refund" },
  ]);
  const r = await selectStaffPermissions(table, { tenantId: TENANT_A, userIds: [USER], permission: "messages.refund" });
  assert.equal(r.error, null);
  assert.equal(r.rows.length, 1);
});

test("legacy shape (column absent): falls back to the plain query and still answers", async () => {
  const { table, queries } = permissionsTable("legacy", [
    { user_id: USER, permission: "messages.refund" },
  ]);
  const r = await selectStaffPermissions(table, { tenantId: TENANT_A, userIds: [USER], permission: "messages.refund" });
  assert.equal(r.error, null);
  assert.equal(r.rows.length, 1);
  assert.deepEqual(queries, ["tenant", "plain"], "tries tenant-scoped first, then retries once without it");
});

test("an unrelated error is surfaced, not retried", async () => {
  const failing = {
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        in: () => q,
        then: <T>(resolve: (v: { data: unknown; error: { code: string; message: string } }) => T) =>
          Promise.resolve({ data: null, error: { code: "57014", message: "statement timeout" } }).then(resolve),
      };
      return q;
    },
  };
  const r = await selectStaffPermissions(failing, { tenantId: TENANT_A, userIds: [USER] });
  assert.equal(r.rows.length, 0);
  assert.equal(r.error?.code, "57014");
});
