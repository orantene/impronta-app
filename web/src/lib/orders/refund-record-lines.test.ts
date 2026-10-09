import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { allocateRefundAcrossLines, bumpLineRefunded, expectedLineRefundCents, reconcileOrderLineRefunds, recordRefundOnOrderLines } from "./refund-record-lines";

type Line = { id: string; total_cents: number; refunded_cents: number };

/**
 * Recording fake: ONE order, any number of parent transactions (`txns`), the order's lines, and the
 * refunded sibling rows. Reads hand back COPIES, so a stale read really is stale (the CAS paths need it).
 */
/** Chainable query fake; the real `from()` returns any, so a loose shape fits. */
type FakeQuery = { eq: (k: string, v: unknown) => FakeQuery; [k: string]: unknown };

const _vref = { n: 0 };
function world(opts: { orderId?: string | null; lines: Line[]; parents?: string[]; refundRows?: Array<{ id: string; gross_amount_cents: number }>; beforeLineWrite?: () => void }) {
  const mk = (id: string) => ({ id, order_id: opts.orderId === undefined ? "o1" : opts.orderId, metadata: {} as Record<string, unknown>, updated_at: "v0" });
  const txns = (opts.parents ?? ["t1"]).map(mk);
  const lines = opts.lines.map((l) => ({ ...l }));
  const refundRows = (opts.refundRows ?? []).map((r) => ({ ...r, metadata: {} as Record<string, unknown>, created_at: new Date().toISOString() }));
  const admin = {
    from: (table: string) => {
      if (table === "booking_transactions") {
        return {
          select: (_cols?: string) => {
            const f: Record<string, unknown> = {};
            const q: FakeQuery = {
              eq: (k: string, v: unknown) => { f[k] = v; return q; },
              not: () => q,
              order: async () => ({ data: refundRows, error: null }),
              maybeSingle: async () => ({ data: { ...(txns.find((t) => t.id === f.id) ?? txns[0]) }, error: null }),
            };
            return q;
          },
          update: (patch: { metadata: Record<string, unknown> }) => {
            const f: Record<string, unknown> = {};
            const q: FakeQuery = {
              eq: (k: string, v: unknown) => { f[k] = v; return q; },
              select: async () => {
                const t = txns.find((x) => x.id === f.id);
                if (!t) { const r = refundRows.find((x) => x.id === f.id); if (r) { r.metadata = patch.metadata; return { data: [{ id: r.id }], error: null }; } return { data: [], error: null }; }
                if (f.updated_at !== undefined && f.updated_at !== t.updated_at) return { data: [], error: null };
                t.metadata = patch.metadata; t.updated_at = `v${++_vref.n}`;
                return { data: [{ id: t.id }], error: null };
              },
            };
            // reconcile's stamp awaits the chain without .select()
            q.then = (res: (v: unknown) => void) => { const r = refundRows.find((x) => x.id === f.id); if (r) r.metadata = patch.metadata; res({ error: null }); };
            return q;
          },
        };
      }
      return {
        select: (_cols?: string) => {
          const f: Record<string, unknown> = {};
          const q: FakeQuery = {
            eq: (k: string, v: unknown) => { f[k] = v; return q; },
            order: async () => ({ data: lines.map((l) => ({ ...l })), error: null }),
            maybeSingle: async () => ({ data: { ...(lines.find((l) => l.id === f.id) ?? lines[0]) }, error: null }),
            then: (res: (v: unknown) => void) => res({ data: lines.map((l) => ({ ...l })), error: null }),
          };
          return q;
        },
        update: (patch: { refunded_cents: number }) => {
          const f: Record<string, unknown> = {};
          const q: FakeQuery = {
            eq: (k: string, v: unknown) => { f[k] = v; return q; },
            select: async () => {
              opts.beforeLineWrite?.();
              const l = lines.find((x) => x.id === f.id)!;
              if (f.refunded_cents !== undefined && f.refunded_cents !== l.refunded_cents) return { data: [], error: null };
              l.refunded_cents = patch.refunded_cents;
              return { data: [{ id: l.id }], error: null };
            },
          };
          return q;
        },
      };
    },
  };
  return { admin, lines, txn: txns[0], txns, refundRows };
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

describe("(a) two refunds on different parents of one order both count", () => {
  it("interleaved writers on the same line: the CAS loser re-reads and adds on top", async () => {
    let injected = false;
    const w = world({
      parents: ["tA", "tB"],
      lines: [{ id: "l1", total_cents: 100_000, refunded_cents: 0 }],
      // Right before A's line write lands, B's refund (a different parent) writes the same line first.
      beforeLineWrite: () => { if (!injected) { injected = true; w.lines[0].refunded_cents += 25_000; } },
    });
    const ok = await bumpLineRefunded(w.admin, "l1", 30_000, { totalCents: 100_000, refundedCents: 0 });
    assert.equal(ok, true);
    assert.equal(w.lines[0].refunded_cents, 55_000, "25,000 from the other parent + 30,000, nothing lost");
  });

  it("gives up (false) rather than overwrite after repeated contention", async () => {
    const w = world({ lines: [{ id: "l1", total_cents: 100_000, refunded_cents: 0 }], beforeLineWrite: () => { w.lines[0].refunded_cents += 1; } });
    assert.equal(await bumpLineRefunded(w.admin, "l1", 30_000, { totalCents: 100_000, refundedCents: 0 }), false);
  });
});

describe("(c) crash-window reconcile", () => {
  it("expected = refunded money capped by what the lines can return", () => {
    assert.equal(expectedLineRefundCents([100_000], 30_000), 30_000);
    assert.equal(expectedLineRefundCents([100_000], 120_000), 100_000);
    assert.equal(expectedLineRefundCents([], 5_000), 0);
  });

  it("a refund the lines never got (crash after the marker) is flagged on the newest refund row", async () => {
    const w = world({ lines: [{ id: "l1", total_cents: 100_000, refunded_cents: 0 }], refundRows: [{ id: "rf1", gross_amount_cents: 30_000 }] });
    const r = await reconcileOrderLineRefunds(w.admin, "o1");
    assert.deepEqual(r, { ok: true, expectedCents: 30_000, actualCents: 0, mismatch: true });
    const m = w.refundRows[0].metadata;
    assert.deepEqual(m.order_lines_mismatch, { expected_cents: 30_000, actual_cents: 0 });
    assert.equal(m.needs_attention, "order_lines_mismatch");
  });

  it("an order that adds up is left alone", async () => {
    const w = world({ lines: [{ id: "l1", total_cents: 100_000, refunded_cents: 30_000 }], refundRows: [{ id: "rf1", gross_amount_cents: 30_000 }] });
    const r = await reconcileOrderLineRefunds(w.admin, "o1");
    assert.equal(r.ok && r.mismatch, false);
    assert.equal(w.refundRows[0].metadata.needs_attention, undefined);
  });

  it("a normal record runs the check at the end and finds nothing wrong", async () => {
    const w = world({ lines: [{ id: "l1", total_cents: 100_000, refunded_cents: 0 }], refundRows: [{ id: "rf1", gross_amount_cents: 30_000 }] });
    const rec = await recordRefundOnOrderLines(w.admin, { transactionId: "t1", refundIds: ["re_1"], amountCents: 30_000 });
    assert.equal(rec.recorded, true);
    assert.equal(w.refundRows[0].metadata.needs_attention, undefined);
  });
});

describe("wiring", () => {
  it("(b) the webhook records from the per-refund slice only, never the cumulative amount", () => {
    const hook = readFileSync(new URL("../payments/refunds.ts", import.meta.url), "utf8");
    assert.match(hook, /if \(refundId && exactSlice\) await recordRefundOnOrderLines\(/);
    assert.match(hook, /refunds\.partial\.linesSkipped/);
    assert.match(hook, /sbLines && eventRefundAmount !== undefined/);
    assert.match(hook, /amountCents: eventRefundAmount \}\)/);
    assert.match(hook, /refunds\.full\.linesSkipped/);
    assert.doesNotMatch(hook, /recordRefundOnOrderLines\([^)]*refundedCents/);
  });

  const rd = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
  it("executeBookingRefund records lines by default and refundOrderLines opts out and uses the same writer", () => {
    const exec = rd("../payments/refund-execute.ts");
    assert.match(exec, /if \(!input\.skipOrderLines\)[\s\S]{0,200}recordRefundOnOrderLines\(/);
    const lines = rd("./refund-execute-lines.ts");
    assert.match(lines, /skipOrderLines: true/);
    assert.match(lines, /recordRefundOnOrderLines\(admin,/);
    const hook = rd("../payments/refunds.ts");
    assert.match(hook, /if \(refundId && exactSlice\) await recordRefundOnOrderLines\(sb,/);
    assert.match(hook, /if \(eventRefundId\) \{[\s\S]{0,300}recordRefundOnOrderLines\(sbLines,/);
    assert.doesNotMatch(lines, /\.update\(\{ refunded_cents:/);
  });
});
