// TUL-1840: a memoised "no membership" must not decide a redirect, and a
// failed read must never be memoised.
import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";

import { forgetUserTenantMemberships, loadUserTenants } from "@/lib/saas/tenant";

type Row = {
  tenant_id: string;
  role: string;
  status: string;
  agencies: { slug: string; display_name: string; status: string } | null;
};
type Result = { data: Row[] | null; error: { message: string } | null };

/** Minimal FakeQuery: from().select().eq().in() resolves to the next queued result. */
function fakeClient(results: Result[]): { client: SupabaseClient; reads: () => number } {
  let reads = 0;
  const query = {
    select: () => query,
    eq: () => query,
    in: () => {
      reads += 1;
      return Promise.resolve(results.shift() ?? { data: [], error: null });
    },
  };
  return { client: { from: () => query } as unknown as SupabaseClient, reads: () => reads };
}

const ownerRow: Row = {
  tenant_id: "t1",
  role: "owner",
  status: "active",
  agencies: { slug: "qa-grok-workspace", display_name: "QA", status: "active" },
};

test("a stale empty list is replaced by a fresh read; the memo does not shadow it", async () => {
  forgetUserTenantMemberships("u1");
  const { client, reads } = fakeClient([
    { data: [], error: null },
    { data: [ownerRow], error: null },
  ]);
  assert.deepEqual(await loadUserTenants(client, "u1", "talent"), []);
  // Memoised: a second plain read does not hit the database.
  assert.deepEqual(await loadUserTenants(client, "u1", "talent"), []);
  assert.equal(reads(), 1);
  const fresh = await loadUserTenants(client, "u1", "talent", { fresh: true });
  assert.equal(fresh.length, 1);
  assert.equal(fresh[0]?.slug, "qa-grok-workspace");
  // The fresh read refreshed the memo.
  assert.equal((await loadUserTenants(client, "u1", "talent")).length, 1);
  assert.equal(reads(), 2);
});

test("a failed read is not memoised", async () => {
  forgetUserTenantMemberships("u2");
  const { client, reads } = fakeClient([
    { data: null, error: { message: "boom" } },
    { data: [ownerRow], error: null },
  ]);
  assert.deepEqual(await loadUserTenants(client, "u2", "talent"), []);
  assert.equal((await loadUserTenants(client, "u2", "talent")).length, 1);
  assert.equal(reads(), 2);
});

test("a fresh read never invents access: no row still means no membership", async () => {
  forgetUserTenantMemberships("u3");
  const { client } = fakeClient([{ data: [], error: null }]);
  assert.deepEqual(await loadUserTenants(client, "u3", "talent", { fresh: true }), []);
});
