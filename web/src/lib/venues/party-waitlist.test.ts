import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { partyWaitlistJoin, partyWaitlistLeave, partyWaitlistSeat } from "./party-waitlist";

function rpcAdmin(handler: (fn: string, args: Record<string, unknown>) => unknown) {
  return {
    from: () => {
      throw new Error("no table");
    },
    rpc: async (fn: string, args: Record<string, unknown>) => ({ data: handler(fn, args), error: null }),
  };
}

test("join refuses an empty name without RPC", async () => {
  let called = false;
  const result = await partyWaitlistJoin(
    rpcAdmin(() => {
      called = true;
      return { ok: true, id: "x" };
    }),
    { tenantId: "t1", partySize: 2, holderName: "  " },
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "invalid");
  assert.equal(called, false);
});

test("seat maps space_occupied from the RPC", async () => {
  const result = await partyWaitlistSeat(
    rpcAdmin((fn) => {
      assert.equal(fn, "party_waitlist_seat");
      return { ok: false, reason: "space_occupied" };
    }),
    {
      tenantId: "t1",
      id: "e1",
      spaceId: "s1",
      actorUserId: "u1",
      operationKey: "seat-key-aa",
      expectedVersion: 1,
    },
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "space_occupied");
});

test("leave writes through party_waitlist_leave", async () => {
  const result = await partyWaitlistLeave(
    rpcAdmin((fn) => {
      assert.equal(fn, "party_waitlist_leave");
      return { ok: true, id: "e1" };
    }),
    { tenantId: "t1", id: "e1", expectedVersion: 1 },
  );
  assert.equal(result.ok, true);
});

test("waitlist SQL is a separate table from waitlist_offers and proves conflict", () => {
  const sql = readFileSync(
    join(process.cwd(), "..", "supabase", "migrations", "20261231224000_party_waitlist.sql"),
    "utf8",
  );
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.party_waitlist/);
  assert.doesNotMatch(sql, /ALTER TABLE public\.waitlist_offers/);
  assert.match(sql, /expected conflict/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.party_waitlist_seat/);
});
