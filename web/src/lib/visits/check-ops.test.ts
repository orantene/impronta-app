import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { visitTransfer } from "./check-ops";

test("two transfer calls of one visit: the RPC decides the winner", async () => {
  let n = 0;
  const admin = {
    rpc: async () => {
      n += 1;
      return n === 1
        ? { data: { ok: true, visit_id: "v1", space_id: "s2" }, error: null }
        : { data: { ok: false, reason: "conflict" }, error: null };
    },
  };
  const a = await visitTransfer(admin, { tenantId: "t1", visitId: "v1", toSpaceId: "s2", operationKey: "xfer-aaaaaa", expectedVersion: 1 });
  const b = await visitTransfer(admin, { tenantId: "t1", visitId: "v1", toSpaceId: "s3", operationKey: "xfer-bbbbbb", expectedVersion: 1 });
  assert.equal(a.ok, true);
  assert.equal(b.ok, false);
  if (!b.ok) assert.equal(b.reason, "conflict");
});

test("visit ops migration drops one-order-per-visit", () => {
  const sql = readFileSync(join(process.cwd(), "..", "supabase", "migrations", "20261231206000_visit_check_ops.sql"), "utf8");
  assert.match(sql, /DROP INDEX IF EXISTS public.orders_one_per_visit/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public.visit_transfer/);
});
