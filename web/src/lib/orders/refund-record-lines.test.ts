import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { allocateRefundAcrossLines, recordRefundOnOrderLines } from "./refund-record-lines";

type Line = { id: string; total_cents: number; refunded_cents: number };

/** Recording fake: booking_transactions (one parent) and order_lines. */
const _vref = { n: 0 };
function world(opts: { orderId?: string | null; lines: Line[] }) {
  const txn: { id: string; order_id: string | null; metadata: Record<string, unknown>; updated_at: string } = { id: "t1", order_id: opts.orderId === undefined ? "o1" : opts.orderId, metadata: {}, updated_at: "v0" };
  const lines = opts.lines.map((l) => ({ ...l }));
  const admin = {
    from: (table: string) => {
      if (table === "booking_transactions") {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { ...txn }, error: null }) }) }),
          update: (patch: { metadata: Record<string, unknown> }) => {
            const f: Record<string, unknown> = {};
            type Q = { eq: (k: string, v: unknown) => Q; select: () => Promise<{ data: { id: string }[]; error: null }> };
            const q: Q = {
              eq: (k: string, v: unknown) => { f[k] = v; return q; },
              // CAS: only the writer holding the current updated_at wins; a win bumps it.
              select: async () => {
                if (f.updated_at !== undefined && f.updated_at !== txn.updated_at) return { data: [], error: null };
                txn.metadata = patch.metadata; txn.updated_at = `v${++_vref.n}`;
                return { data: [{ id: txn.id }], error: null };
              },
            };
            return q;
          },
        };
      }
      return {
        select: () => ({ eq: () => ({ order: async () => ({ data: lines, error: null }) }) }),
        update: (patch: { refunded_cents: number }) => ({ eq: async (_k: string, id: string) => { const l = lines.find((x) => x.id === id)!; l.refunded_cents = patch.refunded_cents; return { error: null }; } }),
      };
    },
  };
  return { admin, lines, txn };
}

describe("allocateRefundAcrossLines", () => {
  it("fills the oldest line first and never exceeds a line's total", () => {
    const a = allocateRefundAcrossLines([{ id: "a", totalCents: 100, refundedCents: 0 }, { id: "b", totalCents: 100, refundedCents: 0 }], 150);
    assert.deepEqual(a, [{ lineId: "a", amountCents: 100 }, { lineId: "b", amountCents: 50 }]);
  });
  it("skips lines with no room and drops the excess (tip, fees)", () => {
    const a = allocateRefundAcrossLines([{ id: "a", totalCents: 100, refundedCents: 100 }, { id: "b", totalCents: 40, refundedCents: 0 }], 90);
    assert.deepEqual(a, [{ lineId: "b", amountCents: 40 }]);
  });
});

describe("recordRefundOnOrderLines", () => {
  it("MX$300 partial refund on a MX$1,000 line is written once (paid run #2)", async () => {
    const w = world({ lines: [{ id: "l1", total_cents: 100_000, refunded_cents: 0 }] });
    const r = await recordRefundOnOrderLines(w.admin, { transactionId: "t1", refundIds: ["re_1"], amountCents: 30_000 });
    assert.equal(r.recorded, true);
    assert.equal(w.lines[0].refunded_cents, 30_000);
  });

  it("running the same refund twice counts refunded_cents once", async () => {
    const w = world({ lines: [{ id: "l1", total_cents: 100_000, refunded_cents: 0 }] });
    await recordRefundOnOrderLines(w.admin, { transactionId: "t1", refundIds: ["re_1"], amountCents: 30_000 });
    const again = await recordRefundOnOrderLines(w.admin, { transactionId: "t1", refundIds: ["re_1"], amountCents: 30_000 });
    assert.deepEqual(again, { recorded: false, reason: "already_recorded" });
    assert.equal(w.lines[0].refunded_cents, 30_000);
  });

  it("a genuinely new refund id adds on top", async () => {
    const w = world({ lines: [{ id: "l1", total_cents: 100_000, refunded_cents: 0 }] });
    await recordRefundOnOrderLines(w.admin, { transactionId: "t1", refundIds: ["re_1"], amountCents: 30_000 });
    await recordRefundOnOrderLines(w.admin, { transactionId: "t1", refundIds: ["re_2"], amountCents: 20_000 });
    assert.equal(w.lines[0].refunded_cents, 50_000);
  });

  it("refund-by-line and the default path share one marker: no double count", async () => {
    const w = world({ lines: [{ id: "l1", total_cents: 100_000, refunded_cents: 0 }] });
    await recordRefundOnOrderLines(w.admin, { transactionId: "t1", refundIds: ["re_9"], amountCents: 40_000, allocation: [{ lineId: "l1", amountCents: 40_000 }] });
    const dup = await recordRefundOnOrderLines(w.admin, { transactionId: "t1", refundIds: ["re_9"], amountCents: 40_000 });
    assert.equal(dup.recorded, false);
    assert.equal(w.lines[0].refunded_cents, 40_000);
  });

  it("the app path then the Stripe webhook for the same re_ id counts once (and vice versa)", async () => {
    const w = world({ lines: [{ id: "l1", total_cents: 100_000, refunded_cents: 0 }] });
    await recordRefundOnOrderLines(w.admin, { transactionId: "t1", refundIds: ["re_7"], amountCents: 30_000 }); // executeBookingRefund
    const hook = await recordRefundOnOrderLines(w.admin, { transactionId: "t1", refundIds: ["re_7"], amountCents: 30_000 }); // webhook
    assert.equal(hook.recorded, false);
    assert.equal(w.lines[0].refunded_cents, 30_000);
    const w2 = world({ lines: [{ id: "l1", total_cents: 100_000, refunded_cents: 0 }] });
    await recordRefundOnOrderLines(w2.admin, { transactionId: "t1", refundIds: ["re_8"], amountCents: 10_000 }); // Stripe-dashboard refund: webhook first
    await recordRefundOnOrderLines(w2.admin, { transactionId: "t1", refundIds: ["re_8"], amountCents: 10_000 });
    assert.equal(w2.lines[0].refunded_cents, 10_000);
  });

  it("two writers racing on one refund id: the loser re-reads, sees the marker and does not count", async () => {
    const w = world({ lines: [{ id: "l1", total_cents: 100_000, refunded_cents: 0 }] });
    // Both read at the same instant (same updated_at), then both try to claim.
    const [a, b] = await Promise.all([
      recordRefundOnOrderLines(w.admin, { transactionId: "t1", refundIds: ["re_5"], amountCents: 20_000 }),
      recordRefundOnOrderLines(w.admin, { transactionId: "t1", refundIds: ["re_5"], amountCents: 20_000 }),
    ]);
    assert.equal([a, b].filter((r) => r.recorded).length, 1);
    assert.equal(w.lines[0].refunded_cents, 20_000);
  });

  it("skips a refund that is not tied to an order", async () => {
    const w = world({ orderId: null, lines: [] });
    const r = await recordRefundOnOrderLines(w.admin, { transactionId: "t1", refundIds: ["re_1"], amountCents: 100 });
    assert.deepEqual(r, { recorded: false, reason: "no_order" });
  });
});

describe("wiring", () => {
  const rd = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
  it("executeBookingRefund records lines by default and refundOrderLines opts out and uses the same writer", () => {
    const exec = rd("../payments/refund-execute.ts");
    assert.match(exec, /if \(!input\.skipOrderLines\)[\s\S]{0,200}recordRefundOnOrderLines\(/);
    const lines = rd("./refund-execute-lines.ts");
    assert.match(lines, /skipOrderLines: true/);
    assert.match(lines, /recordRefundOnOrderLines\(admin,/);
    const hook = rd("../payments/refunds.ts");
    assert.match(hook, /if \(refundId\) await recordRefundOnOrderLines\(sb,/);
    assert.match(hook, /if \(eventRefundId\) \{[\s\S]{0,200}recordRefundOnOrderLines\(sbLines,/);
    assert.doesNotMatch(lines, /\.update\(\{ refunded_cents:/);
  });
});
