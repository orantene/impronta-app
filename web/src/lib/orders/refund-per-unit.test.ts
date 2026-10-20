import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";

import { restoreRefundedLines } from "@/lib/orders/refund-restore";
import { scopeUnitRefund } from "@/lib/orders/refund-unit-scope";

/**
 * MONEY BUG 2 (TUL-1429 / TUL-1431): a refund for ONE ticket repaid and voided
 * every ticket on the line. Four tickets on one 100.00 line.
 */

function fakeAdmin(admissions: Array<{ id: string; order_line_id: string; line_seq: number; admitted_count: number; status: string }>) {
  const voided: string[] = [];
  const admin = {
    from(table: string) {
      assert.equal(table, "admissions");
      return { select: () => ({ in: async () => ({ data: admissions, error: null }) }) };
    },
    async rpc(name: string, args: { p_admission_id?: string }) {
      if (name === "refund_admission") {
        voided.push(String(args.p_admission_id));
        return { data: { ok: true, already: false }, error: null };
      }
      return { data: null, error: null };
    },
  } as unknown as SupabaseClient;
  return { admin, voided };
}

const FOUR = ["a1", "a2", "a3", "a4"].map((id, i) => ({
  id, order_line_id: "L1", line_seq: i, admitted_count: 0, status: "valid",
}));

test("restore: one ticket named -> only that ticket is voided (was: all four)", async () => {
  const { admin, voided } = fakeAdmin(FOUR);
  const out = await restoreRefundedLines(admin, {
    orderId: "O1", lineIds: ["L1"], wholeLineIds: [], releasePromo: false, logScope: "t",
    onlyAdmissionIds: ["a2"],
  });
  assert.deepEqual(voided, ["a2"]);
  assert.equal(out.admissionsStamped, 1);
});

test("restore: an empty list voids nothing (exchange keeps the ticket valid)", async () => {
  const { admin, voided } = fakeAdmin(FOUR);
  await restoreRefundedLines(admin, {
    orderId: "O1", lineIds: ["L1"], wholeLineIds: ["L1"], releasePromo: false, logScope: "t",
    onlyAdmissionIds: [],
  });
  assert.deepEqual(voided, []);
});

test("restore: without a list the whole line is still voided (cancelled event path unchanged)", async () => {
  const { admin, voided } = fakeAdmin(FOUR);
  await restoreRefundedLines(admin, {
    orderId: "O1", lineIds: ["L1"], wholeLineIds: ["L1"], releasePromo: false, logScope: "t",
  });
  assert.deepEqual(voided, ["a1", "a2", "a3", "a4"]);
});

const adm = (ids: string[], over: Record<string, Partial<{ admittedCount: number; status: string }>> = {}) =>
  ids.map((id) => ({ id, admittedCount: 0, status: "valid", ...(over[id] ?? {}) }));

test("amount: 1 of 4 tickets on a 100.00 line refunds 25.00, not 100.00", () => {
  const r = scopeUnitRefund({ remainingCents: 10000, netCents: 10000, admissions: adm(["a1", "a2", "a3", "a4"]), selectedIds: ["a2"] });
  assert.deepEqual(r, { ok: true, amountCents: 2500, selectedIds: ["a2"] });
});

test("amount: the last ticket takes the remainder so no cent is stranded", () => {
  // 100.01 over 3 tickets: 33.33 + 33.33 then 33.35.
  const first = scopeUnitRefund({ remainingCents: 10001, netCents: 10001, admissions: adm(["a", "b", "c"]), selectedIds: ["a"] });
  assert.equal(first.ok && first.amountCents, 3333);
  const last = scopeUnitRefund({
    remainingCents: 10001 - 6666, netCents: 10001,
    admissions: adm(["a", "b", "c"], { a: { status: "refunded" }, b: { status: "refunded" } }), selectedIds: ["c"],
  });
  assert.equal(last.ok && last.amountCents, 3335);
});

test("amount: a discounted line refunds the NET share (netCents already excludes the discount)", () => {
  const r = scopeUnitRefund({ remainingCents: 9000, netCents: 9000, admissions: adm(["a1", "a2", "a3"]), selectedIds: ["a1"] });
  assert.equal(r.ok && r.amountCents, 3000);
});

test("refuses a scanned ticket, an already refunded ticket, and a stranger's ticket", () => {
  const base = { remainingCents: 10000, netCents: 10000 };
  assert.deepEqual(
    scopeUnitRefund({ ...base, admissions: adm(["a1", "a2"], { a1: { admittedCount: 1 } }), selectedIds: ["a1"] }),
    { ok: false, reason: "already_admitted" },
  );
  assert.deepEqual(
    scopeUnitRefund({ ...base, admissions: adm(["a1", "a2"], { a1: { status: "refunded" } }), selectedIds: ["a1"] }),
    { ok: false, reason: "line_already_refunded" },
  );
  assert.deepEqual(
    scopeUnitRefund({ ...base, admissions: adm(["a1", "a2"]), selectedIds: ["zzz"] }),
    { ok: false, reason: "admission_not_on_line" },
  );
});
