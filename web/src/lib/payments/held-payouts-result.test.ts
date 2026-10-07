/**
 * listHeldPayouts returns a discriminated result: a failed read is never an
 * empty list, and hitting the row cap is reported (callers show "500+").
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";

import { HELD_PAYOUTS_CAP, listHeldPayouts, shapeHeldPayoutsRows } from "./booking-payouts-ledger";
import { HELD_PAYOUTS_DISPLAY_CAP, heldCountLabel } from "./held-payouts-display";

function raw(i: number, status = "held"): Record<string, unknown> {
  return {
    id: `p${i}`,
    booking_id: `b${i}`,
    participant_id: `x${i}`,
    party: "talent",
    talent_profile_id: `t${i}`,
    tenant_id: null,
    amount_cents: 1000,
    currency: "usd",
    status,
    attempts: 0,
    last_error: null,
    created_at: "2026-10-01T00:00:00Z",
    release_after: null,
  };
}

/** Minimal chainable fake of the one query listHeldPayouts issues. */
function fakeSb(result: { data: unknown; error: { message: string } | null } | "throw"): {
  sb: SupabaseClient;
  limitArg: () => number | null;
} {
  let lim: number | null = null;
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.in = () => chain;
  chain.order = () => chain;
  chain.limit = (n: number) => {
    lim = n;
    if (result === "throw") throw new Error("boom");
    return Promise.resolve(result);
  };
  return { sb: { from: () => chain } as unknown as SupabaseClient, limitArg: () => lim };
}

test("ok under the cap: rows pass through, capped false", async () => {
  const data = Array.from({ length: 3 }, (_, i) => raw(i, i === 2 ? "failed" : "held"));
  const res = await listHeldPayouts(fakeSb({ data, error: null }).sb);
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.capped, false);
  assert.equal(res.rows.length, 3);
  assert.equal(res.rows[0].bookingId, "b0");
  assert.equal(res.rows[2].status, "failed");
});

test("exactly at the cap is NOT capped; one more row is", () => {
  const exact = shapeHeldPayoutsRows(Array.from({ length: HELD_PAYOUTS_CAP }, (_, i) => raw(i)));
  assert.ok(exact.ok && !exact.capped && exact.rows.length === HELD_PAYOUTS_CAP);
  const over = shapeHeldPayoutsRows(Array.from({ length: HELD_PAYOUTS_CAP + 1 }, (_, i) => raw(i)));
  assert.ok(over.ok && over.capped && over.rows.length === HELD_PAYOUTS_CAP);
});

test("the query asks for cap + 1 rows so the cap can be detected", async () => {
  const f = fakeSb({ data: [], error: null });
  await listHeldPayouts(f.sb);
  assert.equal(f.limitArg(), HELD_PAYOUTS_CAP + 1);
});

test("a database error is { ok: false }, never an empty list", async () => {
  const res = await listHeldPayouts(fakeSb({ data: null, error: { message: "permission denied" } }).sb);
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.match(res.error, /permission denied/);
});

test("a thrown read is { ok: false }", async () => {
  const res = await listHeldPayouts(fakeSb("throw").sb);
  assert.equal(res.ok, false);
});

test("no data without an error is { ok: false }", async () => {
  const res = await listHeldPayouts(fakeSb({ data: null, error: null }).sb);
  assert.equal(res.ok, false);
});

test("display: 500+ when capped, exact count otherwise; cap constants agree", () => {
  assert.equal(heldCountLabel(500, true), "500+");
  assert.equal(heldCountLabel(499, false), "499");
  assert.equal(HELD_PAYOUTS_DISPLAY_CAP, HELD_PAYOUTS_CAP);
});

test("callers: every listHeldPayouts caller consumes the result, none treats it as an array", () => {
  const base = new URL("../../app/(workspace)/platform/admin/commerce/", import.meta.url);
  const loader = readFileSync(new URL("health/load-commerce-health.ts", base), "utf8");
  assert.match(loader, /!heldRes\.ok/);
  assert.match(loader, /state: "error"/);
  const tab = readFileSync(new URL("revenue/HeldPayoutsSection.tsx", base), "utf8");
  assert.match(tab, /readFailed/);
  assert.match(tab, /heldCountLabel/);
  const view = readFileSync(new URL("revenue/RevenueView.tsx", base), "utf8");
  assert.match(view, /heldPayouts: HeldPayoutsResult/);
  assert.match(view, /<HeldPayoutsSection result=\{heldPayouts\}/);
});
