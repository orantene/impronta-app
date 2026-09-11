import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { admissionComp, admissionDeliver, admissionHoldSeats } from "./event-holds";

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
