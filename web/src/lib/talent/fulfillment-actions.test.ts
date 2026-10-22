/**
 * TUL-1708 #4355 follow-up (behavioral-test card): markBookingFulfillmentCore
 * takes its collaborators via MarkFulfillmentDeps, so this exercises the actual
 * control flow with fakes instead of pinning the source. Imports only from
 * fulfillment-core.ts, not fulfillment-actions.ts — the latter's own imports
 * (next/headers, next/cache, and @/lib/bookings/fulfillment's "server-only"
 * chain via record-sync.ts) only resolve inside Next's bundler, not under tsx;
 * see fulfillment-core.ts's header.
 *
 * Covers the exact scenarios the PM asked for:
 *   - editor, non-handed-off status ("preparing"): OK, upsert runs, no transfer.
 *   - editor, handed-off status ("shipped"): refused, no upsert, no transfer.
 *   - manager, handed-off status: OK, upsert runs, transfer runs exactly once
 *     per settled transaction.
 *   - talent owner, handed-off status: OK (the extra capability gate never
 *     applies to the owner path at all).
 *
 * Run: npx tsx --test src/lib/talent/fulfillment-actions.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";

import { markBookingFulfillmentCore, type MarkFulfillmentDeps } from "./fulfillment-core";

const TENANT_ID = "tenant-1";
const BOOKING_ID = "booking-1";
const SETTLED_TXN_IDS = ["txn-1", "txn-2"];
const FAKE_ADMIN = { marker: "fake-admin-handle" };

// Mirrors the real HANDED_OFF_STATES set for exactly the two statuses these tests use.
const isHandedOff = (status: string) => status === "shipped";
const isValidStatus = (status: string) => ["preparing", "shipped"].includes(status);

interface Call {
  upsertCount: number;
  upsertStatuses: string[];
  transferredIds: string[];
  transferErrors: unknown[];
  revalidatedTenants: string[];
}

function makeDeps(opts: {
  via: "owner" | "staff";
  /** Whether the actor passes the staff path's handed-off capability bar. Owner path ignores this. */
  handoffCapabilityGranted: boolean;
}): { deps: MarkFulfillmentDeps; calls: Call } {
  const calls: Call = { upsertCount: 0, upsertStatuses: [], transferredIds: [], transferErrors: [], revalidatedTenants: [] };

  const deps: MarkFulfillmentDeps = {
    isValidStatus,
    isHandedOff,
    authorize: async () => ({
      ok: true,
      tenantId: TENANT_ID,
      talentProfileId: "talent-1",
      via: opts.via,
    }),
    requireHandoffCapability: async (tenantId) => {
      assert.equal(tenantId, TENANT_ID, "requireHandoffCapability must receive the booking's own tenantId");
      return opts.handoffCapabilityGranted;
    },
    getAdmin: () => FAKE_ADMIN,
    upsert: async (_admin, _bookingId, _tenantId, patch) => {
      calls.upsertCount += 1;
      calls.upsertStatuses.push(patch.status);
      return { ok: true, shippedAt: new Date().toISOString() };
    },
    listSettledTransactionIds: async (admin) => {
      assert.equal(admin, FAKE_ADMIN, "listSettledTransactionIds must receive the admin handle from getAdmin");
      return SETTLED_TXN_IDS;
    },
    transfer: async (transactionId) => {
      calls.transferredIds.push(transactionId);
    },
    onTransferError: (err) => calls.transferErrors.push(err),
    revalidate: (tenantId) => calls.revalidatedTenants.push(tenantId),
  };

  return { deps, calls };
}

test("editor (staff path), non-handed-off status (preparing): OK, upsert runs, no transfer", async () => {
  const { deps, calls } = makeDeps({ via: "staff", handoffCapabilityGranted: false });
  const result = await markBookingFulfillmentCore(BOOKING_ID, { status: "preparing" }, deps);
  assert.deepEqual(result, { ok: true, shipped: false });
  assert.equal(calls.upsertCount, 1, "upsert must run for a non-handed-off status");
  assert.deepEqual(calls.upsertStatuses, ["preparing"]);
  assert.deepEqual(calls.transferredIds, [], "no transfer for a non-handed-off status");
  assert.deepEqual(calls.revalidatedTenants, [TENANT_ID]);
});

test("editor (staff path), handed-off status (shipped), lacking booking.payment.request: refused, no upsert, no transfer", async () => {
  const { deps, calls } = makeDeps({ via: "staff", handoffCapabilityGranted: false });
  const result = await markBookingFulfillmentCore(BOOKING_ID, { status: "shipped" }, deps);
  assert.deepEqual(result, { ok: false, error: "Forbidden." });
  assert.equal(calls.upsertCount, 0, "a refused handed-off attempt must never reach upsert");
  assert.deepEqual(calls.transferredIds, [], "a refused handed-off attempt must never run a transfer");
  assert.deepEqual(calls.revalidatedTenants, []);
});

test("manager (staff path), handed-off status (shipped), holding booking.payment.request: OK, upsert runs, transfer runs once per settled transaction", async () => {
  const { deps, calls } = makeDeps({ via: "staff", handoffCapabilityGranted: true });
  const result = await markBookingFulfillmentCore(BOOKING_ID, { status: "shipped" }, deps);
  assert.deepEqual(result, { ok: true, shipped: true });
  assert.equal(calls.upsertCount, 1);
  assert.deepEqual(calls.upsertStatuses, ["shipped"]);
  assert.deepEqual(
    calls.transferredIds,
    SETTLED_TXN_IDS,
    "must run the transfer exactly once per settled transaction, in order",
  );
  assert.deepEqual(calls.revalidatedTenants, [TENANT_ID]);
});

test("talent owner, handed-off status (shipped): OK — the extra capability gate never applies to the owner path", async () => {
  // handoffCapabilityGranted: false proves the owner path truly bypasses the gate,
  // not merely that it happens to pass it.
  const { deps, calls } = makeDeps({ via: "owner", handoffCapabilityGranted: false });
  const result = await markBookingFulfillmentCore(BOOKING_ID, { status: "shipped" }, deps);
  assert.deepEqual(result, { ok: true, shipped: true });
  assert.equal(calls.upsertCount, 1);
  assert.deepEqual(calls.transferredIds, SETTLED_TXN_IDS);
});

test("unauthorized booking lookup: refused before any upsert or transfer", async () => {
  const calls: Call = { upsertCount: 0, upsertStatuses: [], transferredIds: [], transferErrors: [], revalidatedTenants: [] };
  const deps: MarkFulfillmentDeps = {
    isValidStatus,
    isHandedOff,
    authorize: async () => ({ ok: false, error: "Order not found." }),
    requireHandoffCapability: async () => true,
    getAdmin: () => FAKE_ADMIN,
    upsert: async (_admin, _bookingId, _tenantId, patch) => {
      calls.upsertCount += 1;
      calls.upsertStatuses.push(patch.status);
      return { ok: true, shippedAt: null };
    },
    listSettledTransactionIds: async () => SETTLED_TXN_IDS,
    transfer: async (transactionId) => {
      calls.transferredIds.push(transactionId);
    },
    onTransferError: (err) => calls.transferErrors.push(err),
    revalidate: (tenantId) => calls.revalidatedTenants.push(tenantId),
  };
  const result = await markBookingFulfillmentCore(BOOKING_ID, { status: "shipped" }, deps);
  assert.deepEqual(result, { ok: false, error: "Order not found." });
  assert.equal(calls.upsertCount, 0);
});

test("unknown status: refused before authorize is even called", async () => {
  let authorizeCalled = false;
  const deps: MarkFulfillmentDeps = {
    isValidStatus,
    isHandedOff,
    authorize: async () => {
      authorizeCalled = true;
      return { ok: true, tenantId: TENANT_ID, talentProfileId: null, via: "owner" };
    },
    requireHandoffCapability: async () => true,
    getAdmin: () => FAKE_ADMIN,
    upsert: async () => ({ ok: true, shippedAt: null }),
    listSettledTransactionIds: async () => [],
    transfer: async () => {},
    onTransferError: () => {},
    revalidate: () => {},
  };
  const result = await markBookingFulfillmentCore(BOOKING_ID, { status: "bogus" as never }, deps);
  assert.deepEqual(result, { ok: false, error: "Unknown status." });
  assert.equal(authorizeCalled, false, "an unknown status must be rejected before authorizing");
});
