import assert from "node:assert/strict";
import { test } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { BookingPromoPrice } from "@/lib/orders/purchase-promo";

import type { OrderRedemptionDeps } from "./order-redemptions";
import { holdExpiresAt, holdIsLive, REQUEST_HOLD_MINUTES } from "./policy";
import {
  confirmRequestPromos,
  holdRequestPromos,
  releaseRequestPromos,
  requestPromoEffect,
  settleRequestPromosForEvent,
  type RequestHoldDeps,
} from "./request-holds";
import type { RpcResult } from "./service";

type Row = {
  id: string;
  order_id: string | null;
  booking_id: string | null;
  status: string;
  list_cents: number | null;
  discount_cents: number | null;
  amount_cents: number | null;
  currency: string | null;
  source_channel: string | null;
  client_status: string | null;
};

const REQ = "11111111-1111-1111-1111-111111111111";

/** Redemption table fake: eq / is filters, update for snapshots, SQL-like confirm/release. */
function world(rows: Row[]) {
  const confirms: string[] = [];
  const releases: string[] = [];
  const from = () => {
    const filters: Array<[string, unknown]> = [];
    const pick = () => rows.filter((r) => filters.every(([k, v]) => (r as Record<string, unknown>)[k] === v));
    const q = {
      select: () => q,
      update: () => q,
      eq: (k: string, v: unknown) => {
        filters.push([k, v]);
        return q;
      },
      is: (k: string, v: unknown) => {
        filters.push([k, v]);
        return q;
      },
      then: (resolve: (v: { data: Row[]; error: null }) => unknown) => resolve({ data: pick(), error: null }),
    };
    return q;
  };
  const db = { from } as unknown as SupabaseClient;
  const deps: OrderRedemptionDeps = {
    confirm: async (_db, args): Promise<RpcResult> => {
      const row = rows.find((r) => r.id === args.redemptionId);
      if (!row) return { ok: false, reason: "unknown_redemption" };
      row.status = "confirmed";
      confirms.push(row.id);
      return { ok: true, already: false };
    },
    release: async (_db, id): Promise<RpcResult> => {
      const row = rows.find((r) => r.id === id);
      if (!row) return { ok: false, reason: "unknown_redemption" };
      row.status = "released";
      releases.push(id);
      return { ok: true, already: false };
    },
  };
  return { db, deps, confirms, releases };
}

const heldOnRequest = (id: string, over: Partial<Row> = {}): Row => ({
  id, order_id: null, booking_id: REQ, status: "held", list_cents: 50000, discount_cents: 10000,
  amount_cents: 10000, currency: "MXN", source_channel: "site", client_status: "new", ...over,
});

const PRICE: BookingPromoPrice = {
  discountCents: 10000,
  plan: [{ promoId: "p1", isPricePromo: true, source: "auto", listCents: 50000, discountCents: 10000 }],
  clientStatus: "new",
  currency: "MXN",
};

test("holdRequestPromos: holds on the request id (booking_id), never an order, for 24h", async () => {
  const { db } = world([]);
  const calls: Array<Parameters<RequestHoldDeps["holdPromo"]>[1]> = [];
  const deps: RequestHoldDeps = {
    holdPromo: async (_db, input) => {
      calls.push(input);
      return { ok: true, redemption_id: "r1", status: "held" };
    },
  };
  const res = await holdRequestPromos(db, { requestId: REQ, customerId: "c1", price: PRICE }, deps);
  assert.deepEqual(res, { ok: true, redemptionIds: ["r1"] });
  assert.equal(calls[0]?.flow, "request_to_book");
  assert.equal(calls[0]?.bookingId, REQ);
  assert.equal(calls[0]?.orderId, null);
  assert.equal(calls[0]?.discountCents, 10000);
  assert.equal(REQUEST_HOLD_MINUTES, 24 * 60);
});

test("holdRequestPromos: no applied promo means no hold call; a refused hold refuses the request", async () => {
  const { db } = world([]);
  let n = 0;
  const none = await holdRequestPromos(db, { requestId: REQ, customerId: "c1", price: { ...PRICE, plan: [] } }, {
    holdPromo: async () => { n += 1; return { ok: true, redemption_id: "x" }; },
  });
  assert.deepEqual(none, { ok: true, redemptionIds: [] });
  assert.equal(n, 0);
  const full = await holdRequestPromos(db, { requestId: REQ, customerId: "c1", price: PRICE }, {
    holdPromo: async () => ({ ok: false, reason: "exhausted" }),
  });
  assert.equal(full.ok, false);
  if (!full.ok) assert.equal(full.reason, "promo_exhausted");
});

test("accept: the request's held promo is confirmed; another request's and order rows are untouched", async () => {
  const w = world([heldOnRequest("r1"), heldOnRequest("r-other", { booking_id: "other" }), heldOnRequest("r-ord", { order_id: "o1" })]);
  const out = await confirmRequestPromos(w.db, REQ, w.deps);
  assert.deepEqual(out, { ok: true, confirmed: 1, lost: [] });
  assert.deepEqual(w.confirms, ["r1"]);
});

test("decline: the request's held promo goes back to the pool", async () => {
  const w = world([heldOnRequest("r1")]);
  const out = await releaseRequestPromos(w.db, REQ, w.deps);
  assert.deepEqual(out, { ok: true, released: 1 });
  assert.deepEqual(w.releases, ["r1"]);
});

test("expiry: a 24h hold stops counting on its own; inquiry.expired also releases it", async () => {
  const now = new Date("2026-10-14T12:00:00Z");
  const expires = holdExpiresAt("request_to_book", now).toISOString();
  assert.equal(holdIsLive({ status: "held", hold_expires_at: expires }, new Date(now.getTime() + 23 * 3_600_000)), true);
  assert.equal(holdIsLive({ status: "held", hold_expires_at: expires }, new Date(now.getTime() + 24 * 3_600_000 + 1)), false);
  const w = world([heldOnRequest("r1")]);
  await settleRequestPromosForEvent(w.db, { type: "inquiry.expired", inquiryId: REQ }, w.deps);
  assert.deepEqual(w.releases, ["r1"]);
});

test("requestPromoEffect: accept confirms, decline / cancel / archive / expire release, the rest do nothing", () => {
  assert.equal(requestPromoEffect("booking.created"), "confirm");
  assert.equal(requestPromoEffect("reservation.confirmed"), "confirm");
  for (const t of ["reservation.declined", "inquiry.cancelled", "inquiry.archived", "inquiry.expired"]) {
    assert.equal(requestPromoEffect(t), "release");
  }
  assert.equal(requestPromoEffect("message.sent"), null);
});

test("settleRequestPromosForEvent: accept confirms; a failed settle throws so the engine retries", async () => {
  const w = world([heldOnRequest("r1")]);
  await settleRequestPromosForEvent(w.db, { type: "booking.created", inquiryId: REQ }, w.deps);
  assert.deepEqual(w.confirms, ["r1"]);
  const broken = world([heldOnRequest("r2")]);
  const failing: OrderRedemptionDeps = { ...broken.deps, release: async () => ({ ok: false, reason: "db_error" }) };
  await assert.rejects(settleRequestPromosForEvent(broken.db, { type: "reservation.declined", inquiryId: REQ }, failing));
});
