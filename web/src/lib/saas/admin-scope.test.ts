import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";

import { assertRowBelongsToTenant } from "./admin-scope";

type FromCall = { table: string; eqs: Array<[string, string]>; result: { data: unknown } };

function mockSupabase(result: { data: unknown }): { supabase: SupabaseClient; calls: FromCall[] } {
  const calls: FromCall[] = [];
  const supabase = {
    from(table: string) {
      const call: FromCall = { table, eqs: [], result };
      calls.push(call);
      const chain = {
        select() {
          return chain;
        },
        eq(col: string, val: string) {
          call.eqs.push([col, val]);
          return chain;
        },
        maybeSingle() {
          return Promise.resolve(call.result);
        },
      };
      return chain;
    },
  } as unknown as SupabaseClient;
  return { supabase, calls };
}

test("assertRowBelongsToTenant returns true when the query resolves a row in-tenant", async () => {
  const { supabase, calls } = mockSupabase({ data: { id: "row-abc" } });
  const ok = await assertRowBelongsToTenant(supabase, "inquiries", "row-abc", "tenant-T1");
  assert.equal(ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].table, "inquiries");
  assert.deepEqual(calls[0].eqs, [
    ["id", "row-abc"],
    ["tenant_id", "tenant-T1"],
  ]);
});

test("assertRowBelongsToTenant returns false when the row is not in the caller's tenant", async () => {
  // Supabase returns `data: null` when the row id exists but the tenant_id
  // filter excludes it. That is exactly the cross-tenant denial path — the
  // action-layer helper must translate it into "not found for this tenant".
  const { supabase } = mockSupabase({ data: null });
  const ok = await assertRowBelongsToTenant(supabase, "inquiries", "row-xyz", "tenant-T2");
  assert.equal(ok, false);
});

test("assertRowBelongsToTenant short-circuits on empty inputs", async () => {
  const { supabase, calls } = mockSupabase({ data: { id: "row-abc" } });
  assert.equal(await assertRowBelongsToTenant(supabase, "inquiries", "", "tenant-T1"), false);
  assert.equal(await assertRowBelongsToTenant(supabase, "inquiries", "row-abc", ""), false);
  assert.equal(calls.length, 0, "helper must not hit the DB when inputs are empty");
});

test("assertRowBelongsToTenant filters agency_bookings by tenant_id", async () => {
  const { supabase, calls } = mockSupabase({ data: { id: "bk-1" } });
  await assertRowBelongsToTenant(supabase, "agency_bookings", "bk-1", "tenant-T3");
  assert.equal(calls[0].table, "agency_bookings");
  assert.deepEqual(calls[0].eqs, [
    ["id", "bk-1"],
    ["tenant_id", "tenant-T3"],
  ]);
});

test("assertRowBelongsToTenant filters client_accounts by tenant_id", async () => {
  const { supabase, calls } = mockSupabase({ data: { id: "acc-1" } });
  await assertRowBelongsToTenant(supabase, "client_accounts", "acc-1", "tenant-T4");
  assert.equal(calls[0].table, "client_accounts");
  assert.deepEqual(calls[0].eqs, [
    ["id", "acc-1"],
    ["tenant_id", "tenant-T4"],
  ]);
});
