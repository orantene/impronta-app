import { test } from "node:test";
import assert from "node:assert/strict";
import { isMoneyOwed, markAttendance } from "./attendance";

test("a free place is not overdue, even if attendance is marked", () => {
  assert.equal(isMoneyOwed({ status: "paid", totalCents: 0, collectedCents: 0 }), false);
  assert.equal(isMoneyOwed({ status: "pending_payment", totalCents: 0, collectedCents: 0 }), false);
  assert.equal(isMoneyOwed({ status: "pending_payment", totalCents: 4000, collectedCents: 0 }), true);
});

test("marking attendance calls check_in and writes no payment", async () => {
  const calls: string[] = [];
  const admin = {
    from: (table: string) => {
      calls.push(`from:${table}`);
      const api: Record<string, unknown> = {
        select: () => api,
        eq: () => api,
        maybeSingle: async () => ({ data: { id: "adm-1" }, error: null }),
      };
      return api;
    },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push(`rpc:${fn}`);
      assert.equal(fn, "check_in");
      assert.equal(args.p_mode, "actor");
      assert.equal(args.p_admission_id, "adm-1");
      return { data: { ok: true, admitted_count: 1 }, error: null };
    },
  };
  const r = await markAttendance(admin as never, { tenantId: "t1", admissionId: "adm-1", actorUserId: "u1" });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.admittedCount, 1);
  assert.ok(!calls.some((c) => c.includes("booking_transactions")));
});

test("another workspace's admission is unknown, not a leak", async () => {
  const admin = {
    from: () => {
      const api: Record<string, unknown> = {
        select: () => api,
        eq: () => api,
        maybeSingle: async () => ({ data: null, error: null }),
      };
      return api;
    },
    rpc: async () => {
      throw new Error("must not call check_in for a foreign admission");
    },
  };
  const r = await markAttendance(admin as never, { tenantId: "spa", admissionId: "adm-other" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "not_found");
});
