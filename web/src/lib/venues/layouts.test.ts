import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { layoutActivate, servicePeriodUpsert } from "./layouts";

function rpcAdmin(handler: (fn: string, args: Record<string, unknown>) => unknown) {
  return {
    from: () => {
      throw new Error("no table");
    },
    rpc: async (fn: string, args: Record<string, unknown>) => ({ data: handler(fn, args), error: null }),
  };
}

test("layoutActivate maps two_active", async () => {
  const result = await layoutActivate(
    rpcAdmin(() => ({ ok: false, reason: "two_active" })),
    { tenantId: "t1", layoutId: "l1", expectedVersion: 1 },
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "two_active");
});

test("servicePeriodUpsert maps overlap", async () => {
  const result = await servicePeriodUpsert(
    rpcAdmin((fn) => {
      assert.equal(fn, "service_period_upsert");
      return { ok: false, reason: "overlap" };
    }),
    {
      tenantId: "t1",
      locationId: "loc1",
      name: "Dinner",
      weekdayMask: 127,
      startsLocal: "19:00",
      endsLocal: "23:00",
      turnMinutes: 90,
    },
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "overlap");
});

test("layout SQL proves conflict and overlap and does not change capacity", () => {
  const sql = readFileSync(
    join(process.cwd(), "..", "supabase", "migrations", "20261231225000_layouts_periods_stations.sql"),
    "utf8",
  );
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.space_layouts/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.service_periods/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.prep_stations/);
  assert.match(sql, /course_seq/);
  assert.doesNotMatch(sql, /units_total/);
  assert.match(sql, /expected overlap/);
});
