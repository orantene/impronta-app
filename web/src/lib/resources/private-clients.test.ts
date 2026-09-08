import { test } from "node:test";
import assert from "node:assert/strict";
import { listPrivateClients } from "./private-clients";

test("the spa cannot read a therapist's private client list", async () => {
  let queried: string | null = null;
  const admin = {
    from: () => {
      const api: Record<string, unknown> = {
        select: () => api,
        eq: (k: string, v: unknown) => {
          if (k === "tenant_id") queried = String(v);
          return api;
        },
        is: () => api,
        then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
          Promise.resolve({ data: [{ id: "c1", display_name: "secret", email: "a@b.c" }], error: null }).then(resolve),
      };
      return api;
    },
  };
  const r = await listPrivateClients(admin, {
    tenantId: "therapist-workspace",
    actorTenantId: "spa-workspace",
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "cross_workspace");
  assert.equal(queried, null, "a refused read must not query the other tenant's customers");
});

test("the owning workspace reads only its own customers", async () => {
  const seen: Array<[string, unknown]> = [];
  const admin = {
    from: (table: string) => {
      assert.equal(table, "customers");
      const api: Record<string, unknown> = {
        select: () => api,
        eq: (k: string, v: unknown) => {
          seen.push([k, v]);
          return api;
        },
        is: (k: string, v: unknown) => {
          seen.push([k, v]);
          return api;
        },
        then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
          Promise.resolve({
            data: [{ id: "c1", display_name: "Ana", email: "ana@example.com" }],
            error: null,
          }).then(resolve),
      };
      return api;
    },
  };
  const r = await listPrivateClients(admin, {
    tenantId: "therapist-workspace",
    actorTenantId: "therapist-workspace",
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.clients.length, 1);
  assert.deepEqual(seen, [
    ["tenant_id", "therapist-workspace"],
    ["merged_into_id", null],
  ]);
});
