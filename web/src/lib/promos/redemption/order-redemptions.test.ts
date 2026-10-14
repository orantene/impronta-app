import assert from "node:assert/strict";
import { test } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  confirmArgs,
  confirmOrderPromos,
  releaseOrderPromoHolds,
  releasePromoHoldsForClosedCheckout,
  type HeldRow,
  type OrderRedemptionDeps,
} from "./order-redemptions";
import type { RpcResult } from "./service";

type Row = Record<string, unknown>;

/** A redemption table + transactions table, with SQL-like confirm/release state. */
function world(rows: Array<HeldRow & { order_id: string; status: string }>, txns: Row[] = []) {
  const confirms: string[] = [];
  const releases: string[] = [];
  const from = (table: string) => {
    const filters: Array<[string, unknown]> = [];
    const pick = () => {
      const src: Row[] = table === "tenant_promo_redemptions" ? rows : table === "booking_transactions" ? txns : [];
      return src.filter((r) => filters.every(([k, v]) => r[k] === v));
    };
    const q = {
      select: () => q,
      eq: (k: string, v: unknown) => {
        filters.push([k, v]);
        return q;
      },
      maybeSingle: async () => ({ data: pick()[0] ?? null, error: null }),
      then: (resolve: (v: { data: Row[]; error: null }) => unknown) => resolve({ data: pick(), error: null }),
    };
    return q;
  };
  const db = { from } as unknown as SupabaseClient;
  const deps: OrderRedemptionDeps = {
    confirm: async (_db, args): Promise<RpcResult> => {
      const row = rows.find((r) => r.id === args.redemptionId);
      if (!row) return { ok: false, reason: "unknown_redemption" };
      if (row.status === "confirmed") return { ok: true, already: true };
      if (row.id.startsWith("lapsed")) {
        row.status = "released";
        return { ok: false, reason: "hold_expired" };
      }
      row.status = "confirmed";
      confirms.push(row.id);
      return { ok: true, already: false };
    },
    release: async (_db, id): Promise<RpcResult> => {
      const row = rows.find((r) => r.id === id);
      if (!row) return { ok: false, reason: "unknown_redemption" };
      if (row.status === "released") return { ok: true, already: true };
      row.status = "released";
      releases.push(id);
      return { ok: true, already: false };
    },
  };
  return { db, deps, confirms, releases, rows };
}

const held = (id: string, over: Partial<HeldRow> = {}) => ({
  id, order_id: "o1", status: "held", list_cents: 50000, discount_cents: 10000, amount_cents: 10000,
  currency: "mxn", source_channel: "ig_story", client_status: "new", ...over,
});

test("confirmArgs: snapshots come off the held row; junk channel / status become null", () => {
  assert.deepEqual(confirmArgs(held("r1")), {
    redemptionId: "r1", listCents: 50000, discountCents: 10000, currency: "MXN", sourceChannel: "ig_story", clientStatus: "new",
  });
  const legacy = confirmArgs(held("r2", { list_cents: null, discount_cents: null, amount_cents: 700, source_channel: "fax", client_status: "vip" }));
  assert.equal(legacy.discountCents, 700);
  assert.equal(legacy.listCents, 700);
  assert.equal(legacy.sourceChannel, null);
  assert.equal(legacy.clientStatus, null);
});

test("webhook confirm is idempotent: a redelivery confirms nothing twice", async () => {
  const w = world([held("r1"), held("r2", { order_id: "other" })]);
  const first = await confirmOrderPromos(w.db, "o1", w.deps);
  assert.deepEqual(first, { ok: true, confirmed: 1, lost: [] });
  const again = await confirmOrderPromos(w.db, "o1", w.deps);
  assert.deepEqual(again, { ok: true, confirmed: 0, lost: [] });
  assert.deepEqual(w.confirms, ["r1"], "only this order's held row, once");
  assert.equal(w.rows.find((r) => r.id === "r2")?.status, "held", "another order is untouched");
});

test("paid after the hold lapsed and the promo sold out: reported as lost, never thrown", async () => {
  const w = world([held("lapsed-1")]);
  const out = await confirmOrderPromos(w.db, "o1", w.deps);
  assert.deepEqual(out, { ok: false, confirmed: 0, lost: ["lapsed-1"] });
});

test("abandoned checkout releases the order's held uses; a second release is a no-op", async () => {
  const w = world([held("r1"), held("r2")]);
  assert.deepEqual(await releaseOrderPromoHolds(w.db, "o1", w.deps), { ok: true, released: 2 });
  assert.deepEqual(await releaseOrderPromoHolds(w.db, "o1", w.deps), { ok: true, released: 0 });
});

test("closed Stripe session: releases for an unpaid transaction, keeps a settled one's promo", async () => {
  const w = world([held("r1")], [
    { id: "t-open", order_id: "o1", status: "payment_requested" },
    { id: "t-paid", order_id: "o1", status: "paid" },
  ]);
  assert.deepEqual(await releasePromoHoldsForClosedCheckout(w.db, "t-paid", w.deps), { ok: true, released: 0 });
  assert.equal(w.rows[0]?.status, "held");
  assert.deepEqual(await releasePromoHoldsForClosedCheckout(w.db, "t-open", w.deps), { ok: true, released: 1 });
  assert.deepEqual(w.releases, ["r1"]);
});
