/**
 * TUL-1733: editing or creating a client is a WORKSPACE action. The helper proves the client belongs to
 * the caller's workspace (client_profiles has no tenant column and its write policy admits any global
 * agency_staff); the actions use the workspace guard with an editor-tier capability.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { roleGrantsCapability } from "@/lib/access/roles";
import { clientBelongsToTenant } from "./client-tenant-access";

type Row = Record<string, unknown>;
function fake(tables: Record<string, Row[]>, errors: Record<string, { code: string }> = {}) {
  return {
    from(table: string) {
      let rows = [...(tables[table] ?? [])];
      const q: Record<string, unknown> = {};
      Object.assign(q, {
        select: () => q,
        eq: (c: string, v: unknown) => ((rows = rows.filter((r) => r[c] === v)), q),
        maybeSingle: async () => (errors[table] ? { data: null, error: errors[table] } : { data: rows[0] ?? null, error: null }),
      });
      return q;
    },
  } as never;
}
const tables = {
  client_profiles: [{ id: "cp1", user_id: "client-1" }, { id: "cp2", user_id: "client-2" }],
  agency_client_relationships: [{ id: "r1", tenant_id: "tenant-A", client_profile_id: "cp1" }, { id: "r2", tenant_id: "tenant-B", client_profile_id: "cp2" }],
};

test("a client of this workspace is allowed", async () => {
  assert.equal(await clientBelongsToTenant(fake(tables), "tenant-A", "client-1"), true);
});

test("a client of ANOTHER workspace, an unknown client, and empty ids are refused", async () => {
  assert.equal(await clientBelongsToTenant(fake(tables), "tenant-A", "client-2"), false);
  assert.equal(await clientBelongsToTenant(fake(tables), "tenant-A", "nobody"), false);
  assert.equal(await clientBelongsToTenant(fake(tables), "", "client-1"), false);
  assert.equal(await clientBelongsToTenant(fake(tables), "tenant-A", ""), false);
});

test("an unreadable answer fails closed", async () => {
  assert.equal(await clientBelongsToTenant(fake(tables, { client_profiles: { code: "57014" } }), "tenant-A", "client-1"), false);
  assert.equal(await clientBelongsToTenant(fake(tables, { agency_client_relationships: { code: "57014" } }), "tenant-A", "client-1"), false);
});

test("the actions use the workspace guard, prove the relationship, and attach a new client to the workspace", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/server-actions/admin-clients.ts"), "utf8").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(src, /\brequireStaff\(\)/);
  assert.equal((src.match(/requireStaffTenantAction\(\{ capability: "edit_client_relationship" \}\)/g) ?? []).length, 2);
  assert.match(src, /clientBelongsToTenant\(supabase, auth\.tenantId, userId\)/);
  assert.match(src, /ensureTenantClientRelationship\(\{ userId, tenantId: auth\.tenantId/);
});

test("edit_client_relationship: viewer refused, editor and above allowed", () => {
  assert.equal(roleGrantsCapability("viewer", "edit_client_relationship"), false);
  for (const role of ["editor", "manager", "admin", "owner"] as const) assert.equal(roleGrantsCapability(role, "edit_client_relationship"), true, role);
});
