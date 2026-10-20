import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { blankComments } from "@/lib/quality/supabase-unchecked-read";
import { planRefund, releasesPromoRedemption } from "@/lib/orders/refund-plan";
import { restoreRefundedLines } from "@/lib/orders/refund-restore";
import { scopeUnitRefund } from "@/lib/orders/refund-unit-scope";

/**
 * MONEY BUG 2 (TUL-1429 / TUL-1431): a refund for ONE ticket repaid and voided
 * every ticket on the line. Four tickets on one 100.00 line.
 */

function fakeAdmin(admissions: Array<{ id: string; order_line_id: string; line_seq: number; admitted_count: number; status: string }>) {
  const voided: string[] = [];
  const promoVoids: string[] = [];
  const allocationReads: string[][] = [];
  const admin = {
    from(table: string) {
      if (table === "tenant_promo_redemptions") {
        return {
          update: () => ({
            eq: (_c: string, orderId: string) => ({
              in: async () => {
                promoVoids.push(orderId);
                return { data: null, error: null };
              },
            }),
          }),
        };
      }
      if (table === "capacity_allocations") {
        return {
          select: () => ({
            in: (_c: string, ids: string[]) => {
              allocationReads.push(ids);
              return { neq: async () => ({ data: [], error: null }) };
            },
          }),
        };
      }
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
  return { admin, voided, promoVoids, allocationReads };
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
  assert.deepEqual(r, { ok: true, amountCents: 2500, selectedIds: ["a2"], takesRest: false });
});

test("amount: the LAST unrefunded ticket says it takes the rest (so the planner's fee-aware cap applies)", () => {
  const r = scopeUnitRefund({
    remainingCents: 2500, netCents: 10000,
    admissions: adm(["a1", "a2", "a3", "a4"], { a1: { status: "refunded" }, a2: { status: "refunded" }, a3: { status: "refunded" } }),
    selectedIds: ["a4"],
  });
  assert.deepEqual(r, { ok: true, amountCents: 2500, selectedIds: ["a4"], takesRest: true });
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

// ── P2 (TUL-1452): the final per-ticket refund vs the E3 restore rule and the
// fee rules. E3 (TUL-1268 M5): a refund that undoes the purchase restores
// tickets, seats and the promo. A ticket's seat is its own allocation, freed by
// `refund_admission`; the promo is released when the plan is FULL.

const line = (id: string, total: number, refunded = 0) => ({ id, totalCents: total, refundedCents: refunded, variantId: null, eventId: null });
const txn = (id: string, gross: number, refunded = 0, fee = 0) =>
  ({ id, grossAmountCents: gross, refundedCents: refunded, nonRefundableFeeCents: fee });

test("E3: refunding the last ticket on the order's only line is a FULL refund and releases the promo", () => {
  // 3 of 4 already refunded at 25.00 each; the 4th takes the remaining 25.00.
  const plan = planRefund({
    lines: [line("L1", 10000, 7500)], lineIds: ["L1"], scope: {}, discountCents: 0,
    transactions: [txn("t1", 10000, 7500)], amountCents: 2500,
  });
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.equal(plan.isFullRefund, true);
  assert.equal(releasesPromoRedemption(plan), true);
});

test("E3: a middle ticket is a PARTIAL refund and keeps the promo redemption", () => {
  const plan = planRefund({
    lines: [line("L1", 10000)], lineIds: ["L1"], scope: {}, discountCents: 0,
    transactions: [txn("t1", 10000)], amountCents: 2500,
  });
  assert.equal(plan.ok && plan.isFullRefund, false);
  assert.equal(plan.ok && releasesPromoRedemption(plan), false);
});

test("E3: restore for the last ticket voids only it, frees its seat via refund_admission, and releases the promo", async () => {
  const rows = FOUR.map((a, i) => (i < 3 ? { ...a, status: "refunded" } : a));
  const { admin, voided, promoVoids, allocationReads } = fakeAdmin(rows);
  const out = await restoreRefundedLines(admin, {
    orderId: "O1", lineIds: ["L1"], wholeLineIds: ["L1"], releasePromo: true, logScope: "t",
    onlyAdmissionIds: ["a4"],
  });
  assert.deepEqual(voided, ["a4"], "the seat goes back with the ticket, under refund_admission's lock");
  assert.equal(out.releasedPromoRedemption, true);
  assert.deepEqual(promoVoids, ["O1"]);
  // A ticket line's capacity is per-admission; it must never be freed line-wide
  // (that would resell seats still held by valid tickets on a partial).
  assert.deepEqual(allocationReads, []);
});

test("E3: a middle-ticket restore does not touch the promo", async () => {
  const { admin, promoVoids } = fakeAdmin(FOUR);
  await restoreRefundedLines(admin, {
    orderId: "O1", lineIds: ["L1"], wholeLineIds: [], releasePromo: false, logScope: "t",
    onlyAdmissionIds: ["a2"],
  });
  assert.deepEqual(promoVoids, []);
});

test("fees: a kept fee caps a whole-remaining refund, but an explicit amount above capture refuses", () => {
  // 100.00 line, 3.00 kept on the charge, 3 tickets already refunded at 25.00.
  // Capture left = 100.00 - 3.00 - 75.00 = 22.00; line left = 25.00.
  const base = { lines: [line("L1", 10000, 7500)], lineIds: ["L1"], scope: {}, discountCents: 0, transactions: [txn("t1", 10000, 7500, 300)] };
  const explicit = planRefund({ ...base, amountCents: 2500 });
  assert.deepEqual(explicit, { ok: false, reason: "exceeds_captured" }, "the old last-ticket path: stuck forever");
  const rest = planRefund(base);
  assert.equal(rest.ok && rest.totalCents, 2200, "fee kept, the rest returned");
});

const EXECUTOR = blankComments(readFileSync(join(process.cwd(), "src/lib/orders/refund-execute-lines.ts"), "utf8"));

test("executor: the last ticket leaves the amount UNSET so the planner applies the fee-aware cap", () => {
  assert.match(EXECUTOR, /if \(amountCents == null && scoped\.amountCents > 0 && !scoped\.takesRest\) amountCents = scoped\.amountCents/);
});
