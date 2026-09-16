import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { admissionComp, admissionDeliver, admissionHoldConsume, admissionHoldSeats } from "./event-holds";

function rpcAdmin(handler: (fn: string, args: Record<string, unknown>) => unknown) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      }),
    }),
    rpc: async (fn: string, args: Record<string, unknown>) => ({ data: handler(fn, args), error: null }),
  };
}

test("hold seats refuses a short operation key", async () => {
  const result = await admissionHoldSeats(rpcAdmin(() => ({ ok: true, id: "h1" })), {
    tenantId: "t1",
    sessionId: "s1",
    seatIds: ["seat-1"],
    operationKey: "short",
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "invalid");
});

test("hold seats maps seat_taken", async () => {
  const result = await admissionHoldSeats(
    rpcAdmin((fn) => {
      assert.equal(fn, "admission_hold_seats");
      return { ok: false, reason: "seat_taken" };
    }),
    { tenantId: "t1", sessionId: "s1", seatIds: ["seat-1"], operationKey: "hold-key-aa" },
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "seat_taken");
});

test("comp maps needs_approval", async () => {
  const result = await admissionComp(
    rpcAdmin(() => ({ ok: false, reason: "needs_approval" })),
    {
      tenantId: "t1",
      sessionId: "s1",
      tierVariantId: "v1",
      holderName: "Ada",
      reason: "press",
      operationKey: "comp-key-aa",
    },
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "needs_approval");
});

test("deliver sms is channel_unavailable without a send", async () => {
  const result = await admissionDeliver(rpcAdmin(() => ({ ok: true })), {
    tenantId: "t1",
    admissionId: "a1",
    method: "sms",
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "channel_unavailable");
});

test("event hold SQL uses reserve_resource_set_v2 and proves not_found", () => {
  const sql = readFileSync(
    join(process.cwd(), "..", "supabase", "migrations", "20261231227000_event_seats_holds.sql"),
    "utf8",
  );
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.event_seat_maps/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.admission_holds/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.event_series/);
  assert.match(sql, /reserve_resource_set_v2/);
  assert.match(sql, /event_series_id/);
  assert.match(sql, /admissions\.delivery|ADD COLUMN IF NOT EXISTS delivery/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.admission_hold_seats/);
  assert.match(sql, /expected not_found/);
});

/* ── A5: the purchase consumes the holds it was sold with ─────────────────── */

test("hold seats returns every hold id, not just the first", async () => {
  const result = await admissionHoldSeats(
    rpcAdmin(() => ({ ok: true, id: "h1", ids: ["h1", "h2"], expires_at: "2026-10-01T00:00:00Z" })),
    { tenantId: "t1", sessionId: "s1", seatIds: ["seat-1", "seat-2"], operationKey: "hold-key-aa" },
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.ids, ["h1", "h2"]);
  assert.equal(result.id, "h1");
});

test("consume binds the holds to the order through admission_hold_consume", async () => {
  const result = await admissionHoldConsume(
    rpcAdmin((fn, args) => {
      assert.equal(fn, "admission_hold_consume");
      assert.deepEqual(args, { p_tenant_id: "t1", p_hold_ids: ["h1", "h2"], p_order_id: "o1" });
      return { ok: true, converted: ["h1", "h2"], already: false, expires_at: "2026-10-01T00:30:00Z" };
    }),
    { tenantId: "t1", holdIds: ["h1", "h2"], orderId: "o1" },
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.converted, ["h1", "h2"]);
  assert.equal(result.already, false);
});

test("consume maps hold_expired, seat_taken and not_open; an empty list never reaches the socket", async () => {
  for (const reason of ["hold_expired", "seat_taken", "not_open"] as const) {
    const result = await admissionHoldConsume(rpcAdmin(() => ({ ok: false, reason })), {
      tenantId: "t1",
      holdIds: ["h1"],
      orderId: "o1",
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, reason);
  }
  const empty = await admissionHoldConsume(
    rpcAdmin(() => {
      throw new Error("must not call");
    }),
    { tenantId: "t1", holdIds: [], orderId: "o1" },
  );
  assert.deepEqual(empty, { ok: false, reason: "invalid" });
});

test("20261231238000 consumes holds, keeps a converted seat taken, and frees it with its order", () => {
  const sql = readFileSync(
    join(process.cwd(), "..", "supabase", "migrations", "20261231238000_admission_hold_consume.sql"),
    "utf8",
  );
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.admission_hold_consume\(/);
  assert.match(sql, /status = 'converted',\s+order_id = p_order_id/);
  assert.match(sql, /extend_capacity_hold\(v_allocs, v_ttl\)/);
  // admission_hold_seats: a converted seat is taken while its order lives.
  assert.match(sql, /seat_space_id = v_seat AND status = 'converted'/);
  assert.match(sql, /o\.status IN \('cancelled', 'refunded'\)/);
  // The reaper never releases a converted seat on its own expiry.
  assert.match(sql, /WHERE h\.status = 'converted' AND o\.status IN \('cancelled', 'refunded'\)/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.admission_hold_consume\(uuid, uuid\[\], uuid\) FROM PUBLIC, anon, authenticated/);
});

// D-142: the comp's paid order needs an identity (orders_identified_before_payment).
// The holder's customer travels to the RPC; the RPC itself mints the receipt code
// for a guest comp (asserted on the migration text below).
test("comp hands the holder's customer to the RPC and reads the receipt code back", async () => {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const result = await admissionComp(
    rpcAdmin((fn, args) => {
      calls.push({ fn, args });
      return { ok: true, id: "adm-1", order_id: "ord-1", line_id: "line-1", receipt_code: "cmp0123456789abcdef0123" };
    }),
    {
      tenantId: "t1",
      sessionId: "s1",
      tierVariantId: "v1",
      holderName: "Ada",
      holderEmail: "ada@example.com",
      reason: "press",
      operationKey: "comp-key-aa",
      customerId: "cust-1",
    },
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.receiptCode, "cmp0123456789abcdef0123");
  assert.equal(calls[0].fn, "admission_comp");
  assert.equal(calls[0].args.p_customer_id, "cust-1");
});

test("admission_comp SQL writes an identity the paid-order constraint accepts", () => {
  const { readdirSync, readFileSync } = require("node:fs") as typeof import("node:fs");
  const { join } = require("node:path") as typeof import("node:path");
  const dir = join(process.cwd(), "..", "supabase", "migrations");
  const latest = readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .reverse()
    .find((name) => readFileSync(join(dir, name), "utf8").includes("FUNCTION public.admission_comp("));
  assert.ok(latest);
  const sql = readFileSync(join(dir, latest!), "utf8");
  const body = sql.slice(sql.indexOf("FUNCTION public.admission_comp("));
  assert.match(body, /p_customer_id uuid DEFAULT NULL/);
  assert.match(body, /customer_id, guest_session_id, receipt_code, session_id/);
  assert.match(body, /v_receipt := 'cmp' \|\| replace\(gen_random_uuid\(\)::text, '-', ''\)/);
});
