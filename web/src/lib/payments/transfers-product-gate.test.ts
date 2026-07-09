/**
 * Proves the product-payout gate WIRING inside executeBookingTransfers without
 * the payment state machine: a stubbed Supabase client returns a genuinely
 * 'paid' transaction and a toggleable booking_sub_type / shipped_at, with a spy
 * on the commission-snapshot load (the first thing AFTER the gate).
 *
 *   - product + not shipped → gate BLOCKS: returns [], snapshot load never runs.
 *   - product + shipped      → gate PASSES: snapshot load runs.
 *   - service                → gate never applies: snapshot load runs.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { executeBookingTransfers } from "./transfers";

type StubOpts = { subType: string; shipped: boolean; onSnapshotSelect: () => void };

function makeStubSb(opts: StubOpts) {
  const builder = (table: string) => {
    const b: Record<string, unknown> = {};
    const chain = () => b;
    b.select = () => {
      if (table === "booking_commission_snapshot") opts.onSnapshotSelect();
      return b;
    };
    b.eq = chain;
    b.in = chain;
    b.not = chain;
    b.order = chain;
    b.limit = chain;
    b.maybeSingle = () => {
      if (table === "booking_transactions") {
        return Promise.resolve({ data: { id: "t1", booking_id: "b1", status: "paid", currency: "eur" } });
      }
      if (table === "agency_bookings") return Promise.resolve({ data: { booking_sub_type: opts.subType } });
      if (table === "booking_fulfillment") {
        return Promise.resolve({ data: opts.shipped ? { shipped_at: "2026-01-01T00:00:00Z" } : { shipped_at: null } });
      }
      return Promise.resolve({ data: null });
    };
    // Thenable so `await sb.from(...).select(...).eq(...)` (snapshot load) resolves.
    b.then = (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(resolve);
    return b;
  };
  return { from: builder } as never;
}

describe("executeBookingTransfers — product payout gate", () => {
  it("BLOCKS a paid product before shipment (no snapshot load, empty outcomes)", async () => {
    let snapshotLoaded = false;
    const out = await executeBookingTransfers("t1", {
      sb: makeStubSb({ subType: "product", shipped: false, onSnapshotSelect: () => (snapshotLoaded = true) }),
    });
    assert.equal(out.length, 0, "deferred → no outcomes");
    assert.equal(snapshotLoaded, false, "gate returns BEFORE loading commission snapshots");
  });

  it("PASSES a paid product once shipped (snapshot load runs)", async () => {
    let snapshotLoaded = false;
    await executeBookingTransfers("t1", {
      sb: makeStubSb({ subType: "product", shipped: true, onSnapshotSelect: () => (snapshotLoaded = true) }),
    });
    assert.equal(snapshotLoaded, true, "shipped product is not gated");
  });

  it("never gates a service booking (snapshot load runs)", async () => {
    let snapshotLoaded = false;
    await executeBookingTransfers("t1", {
      sb: makeStubSb({ subType: "service", shipped: false, onSnapshotSelect: () => (snapshotLoaded = true) }),
    });
    assert.equal(snapshotLoaded, true, "service is never product-gated");
  });
});
