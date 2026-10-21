import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

/**
 * TUL-1757: marking a booking no-show counted the client twice when the guarded confirmed -> no_show update
 * matched 0 rows (double click, concurrent mark) and, being read-modify-write, when two marks overlapped.
 * Now: the counter moves only when THIS call flipped the row (exactly 1 row back), by one atomic
 * `customers.no_shows = no_shows + 1` inside an RPC.
 */

const src = readFileSync(join(__dirname, "booking-actions.ts"), "utf8");
const fn = src.slice(src.indexOf("export async function markBookingNoShow"), src.indexOf("export async function completeBooking"));
const sql = readFileSync(
  join(__dirname, "..", "..", "..", "..", "supabase", "migrations", "_pending_pm", "20261231424800_increment_customer_no_shows_tul1757.sql"),
  "utf8",
);

describe("markBookingNoShow counts a no-show once (TUL-1757)", () => {
  it("reads back the rows the guarded update changed", () => {
    const up = fn.slice(fn.indexOf('.update({ status: "no_show" })'));
    assert.match(up.slice(0, 200), /\.eq\("status", "confirmed"\)\s*\.select\("id"\)/);
  });

  it("returns before the increment unless exactly one row changed", () => {
    assert.match(fn, /flipped\.length !== 1\) return \{ ok: true, already: true \}/);
    const idx = fn.indexOf("increment_customer_no_shows");
    assert.ok(idx > 0, "uses the atomic RPC");
    const guard = fn.lastIndexOf("!== 1", idx);
    assert.ok(guard > 0 && idx - guard < 1200, "the increment sits behind the one-row check");
  });

  it("a lost race returns already, writes no mirror, no counter and no activity", () => {
    const m = fn.match(/if \(!flipped[^\n]*\n?[^\n]*already: true[^\n]*/);
    assert.ok(m, "zero rows changed returns { ok: true, already: true }");
    assert.ok(fn.indexOf("already: true", fn.indexOf("flipped")) < fn.indexOf("talent_bookings"));
  });

  it("no read-modify-write on customers.no_shows remains", () => {
    assert.ok(!/select\("no_shows"\)/.test(fn));
    assert.ok(!/no_shows: next/.test(fn));
  });

  it("an RPC failure is logged and never fails the already-recorded no-show", () => {
    assert.match(fn, /logServerError\("agenda\.markBookingNoShow\.customer"/);
  });
});

describe("increment_customer_no_shows migration (held in _pending_pm)", () => {
  it("is one atomic UPDATE ... SET no_shows = no_shows + 1", () => {
    assert.match(sql, /UPDATE public\.customers\s+SET no_shows = no_shows \+ 1/);
    assert.match(sql, /WHERE id = p_customer_id/);
  });

  it("is executable by service_role only", () => {
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.increment_customer_no_shows\(uuid\) FROM PUBLIC, anon, authenticated;/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.increment_customer_no_shows\(uuid\) TO service_role;/);
    assert.ok(!/GRANT EXECUTE[^;]*(anon|authenticated|PUBLIC)/.test(sql.replace(/REVOKE[^;]*;/g, "")));
  });

  it("is additive: no drop, no table change", () => {
    assert.ok(!/DROP |ALTER TABLE/i.test(sql.replace(/--[^\n]*/g, "")));
  });
});
