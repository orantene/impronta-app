import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertTransactionOnThread, refundOnThread } from "./refund-thread-scope";

type Row = Record<string, unknown>;

/** Minimal chainable fake: select().eq()...maybeSingle() over in-memory tables. */
function fakeSb(tables: Record<string, Row[]>, failTable?: string): SupabaseClient {
  return {
    from(table: string) {
      const filters: Array<[string, unknown]> = [];
      const q = {
        select() {
          return q;
        },
        eq(col: string, val: unknown) {
          filters.push([col, val]);
          return q;
        },
        async maybeSingle() {
          if (table === failTable) return { data: null, error: { message: "boom" } };
          const hit = (tables[table] ?? []).find((r) => filters.every(([c, v]) => r[c] === v));
          return { data: hit ?? null, error: null };
        },
      };
      return q;
    },
  } as unknown as SupabaseClient;
}

const tables = {
  agency_bookings: [
    { id: "b1", tenant_id: "t1", source_inquiry_id: "q1" },
    { id: "b2", tenant_id: "t2", source_inquiry_id: "q2" },
  ],
  booking_transactions: [
    { id: "x1", booking_id: "b1" },
    { id: "x2", booking_id: "b2" },
  ],
};

test("own thread: transaction on the thread's booking passes", async () => {
  const r = await assertTransactionOnThread(fakeSb(tables), { tenantId: "t1", inquiryId: "q1", transactionId: "x1" });
  assert.deepEqual(r, { ok: true, bookingId: "b1" });
});

test("foreign transaction (another booking) is refused", async () => {
  const r = await assertTransactionOnThread(fakeSb(tables), { tenantId: "t1", inquiryId: "q1", transactionId: "x2" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, "wrong_thread");
});

test("non-owner tenant cannot reach another workspace's thread", async () => {
  const r = await assertTransactionOnThread(fakeSb(tables), { tenantId: "t1", inquiryId: "q2", transactionId: "x2" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, "no_booking");
});

test("DB read error fails closed", async () => {
  for (const failTable of ["agency_bookings", "booking_transactions"]) {
    const r = await assertTransactionOnThread(fakeSb(tables, failTable), {
      tenantId: "t1",
      inquiryId: "q1",
      transactionId: "x1",
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "unavailable");
  }
});

test("the inbox action runs the scope check before executeBookingRefund", () => {
  const src = readFileSync(join(process.cwd(), "src/app/(workspace)/[tenantSlug]/admin/_pipeline-actions.ts"), "utf8");
  const start = src.indexOf("export async function refundInquiryTransaction");
  assert.ok(start > 0, "action exists");
  const body = src.slice(start, start + 2500);
  assert.ok(body.includes("refundOnThread"));
});

test("refundOnThread: no billing permission is refused before anything runs", async () => {
  let executed = false;
  const r = await refundOnThread(fakeSb(tables), { tenantId: "t1", inquiryId: "q1", transactionId: "x1" }, {
    canRefund: async () => false,
    execute: async () => {
      executed = true;
      return { ok: true };
    },
  });
  assert.equal(r.ok, false);
  assert.equal(executed, false);
});

test("refundOnThread: inquiry/transaction mismatch never reaches the refund", async () => {
  let executed = false;
  const r = await refundOnThread(fakeSb(tables), { tenantId: "t1", inquiryId: "q1", transactionId: "x2" }, {
    canRefund: async () => true,
    execute: async () => {
      executed = true;
      return { ok: true };
    },
  });
  assert.equal(r.ok, false);
  assert.equal(executed, false);
});

test("refundOnThread: permitted + on-thread delegates once", async () => {
  const seen: string[] = [];
  const r = await refundOnThread(fakeSb(tables), { tenantId: "t1", inquiryId: "q1", transactionId: "x1" }, {
    canRefund: async () => true,
    execute: async (id) => {
      seen.push(id);
      return { ok: true };
    },
  });
  assert.equal(r.ok, true);
  assert.deepEqual(seen, ["x1"]);
});
