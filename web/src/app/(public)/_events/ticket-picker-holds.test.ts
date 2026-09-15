import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

test("public ticket hold calls admissionHoldSeats, not a second writer", () => {
  const src = readFileSync(join(process.cwd(), "src/app/(public)/_events/ticket-picker-actions.ts"), "utf8");
  assert.match(src, /admissionHoldSeats/);
  assert.match(src, /export async function holdTicketSeats/);
  assert.match(src, /from\("event_seat_maps"\)/);
});

/**
 * A5 (audit 2026-09-15). The picker held seats and then bought without them:
 * `buy()` never sent the hold ids, the purchase reserved tier capacity on its
 * own, and the seat hold expired. The purchase now CONSUMES the holds it was
 * sold with, and unwinds when the engine refuses.
 */
test("the purchase consumes the holds the picker took, and unwinds on a refusal", () => {
  const actions = readFileSync(join(process.cwd(), "src/app/(public)/_events/ticket-picker-actions.ts"), "utf8");
  // The wire carries the holds…
  assert.match(actions, /holdIds: z\.array\(uuidWire\)\.max\(40\)\.optional\(\)/);
  // …the purchase binds them…
  assert.match(actions, /admissionHoldConsume\(admin, \{ tenantId: d\.tenantId, holdIds: d\.holdIds, orderId: result\.orderId \}\)/);
  // …and a refusal releases the capacity, cancels the order, and names the seat.
  assert.match(actions, /releaseCapacity\(result\.allocationIds, admin\)/);
  assert.match(actions, /update\(\{ status: "cancelled" \}\)\.eq\("id", result\.orderId\)/);
  assert.match(actions, /bound\.reason === "seat_taken" \|\| bound\.reason === "hold_expired"/);
  // The hold reply carries every id, so a two-seat basket binds two seats.
  assert.match(actions, /ids: held\.ids/);

  const island = readFileSync(join(process.cwd(), "src/lib/site-admin/builder-node/ticket-picker-island.tsx"), "utf8");
  assert.match(island, /setHoldIds\(res\.ids\)/);
  assert.match(island, /holdIds: holdIds\.length > 0 \? holdIds : undefined/);

  const mint = readFileSync(join(process.cwd(), "src/lib/events/mint-on-paid.ts"), "utf8");
  assert.match(mint, /stampConsumedSeats/);
  assert.match(mint, /\.eq\("status", "converted"\)/);
});

test("pos_reserve_collection follow-up accepts method link after 20261231233000", () => {
  const sql = readFileSync(
    join(process.cwd(), "..", "supabase", "migrations", "20261231235000_pos_reserve_collection_accepts_link.sql"),
    "utf8",
  );
  assert.match(sql, /p_method NOT IN \('cash', 'online_card', 'terminal', 'link'\)/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.pos_reserve_collection/);
});
