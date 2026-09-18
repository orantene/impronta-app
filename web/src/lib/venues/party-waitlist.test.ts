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

// D-172: seating a waiting party from the Live Floor opened the table as a
// nameless walk-in. The party's name, size and contact must reach the
// table: the visit carries the size, an admission the holder.
test("seat carries the party's name, size and contact to the table as an admission", async () => {
  const rpcCalls: string[] = [];
  const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
  const space = { id: "s1", tenant_id: "t1", status: "active", party_min: 1, party_max: 6 };
  const party = { holder_name: "Prove Tables", holder_email: "prove@impronta.test", holder_phone: "+5215500000000", party_size: 3 };
  const admin = {
    rpc: async (fn: string) => {
      rpcCalls.push(fn);
      if (fn === "party_waitlist_seat") return { data: { ok: true, id: "e1", party_size: 3, version: 2, claimed: true }, error: null };
      if (fn === "party_waitlist_attach_visit") return { data: { ok: true, id: "e1", version: 3 }, error: null };
      return { data: { ok: false, reason: "not_found" }, error: null };
    },
    from: (table: string) => {
      let inserted: Record<string, unknown> | null = null;
      const api: Record<string, unknown> = {
        select: () => api,
        eq: () => api,
        in: () => api,
        update: () => api,
        insert: (row: Record<string, unknown>) => {
          inserted = row;
          inserts.push({ table, row });
          return api;
        },
        maybeSingle: async () => {
          if (table === "spaces") return { data: space, error: null };
          if (table === "party_waitlist") return { data: party, error: null };
          return { data: null, error: null }; // no open visit on either column
        },
        single: async () => ({ data: { id: table === "visits" ? "v1" : "o1", ...(inserted ?? {}) }, error: null }),
        then: undefined,
      };
      // `insert(...)` without `.select()` is awaited directly.
      (api as { then?: unknown }).then = (resolve: (v: unknown) => void) => resolve({ data: null, error: null });
      return api;
    },
  };

  const result = await partyWaitlistSeat(admin, {
    tenantId: "t1",
    id: "e1",
    spaceId: "s1",
    actorUserId: "u1",
    operationKey: "seat-key-aa",
    expectedVersion: 1,
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  if (!result.ok) return;
  assert.equal(result.visitId, "v1");
  assert.equal(result.partySize, 3);
  assert.deepEqual(rpcCalls, ["party_waitlist_seat", "party_waitlist_attach_visit"]);

  const visit = inserts.find((i) => i.table === "visits");
  assert.ok(visit, "the visit is opened");
  assert.equal(visit!.row.party_size, 3);
  assert.equal(visit!.row.space_id, "s1");

  const admission = inserts.find((i) => i.table === "admissions");
  assert.ok(admission, "the party's admission is written");
  assert.equal(admission!.row.holder_name, "Prove Tables");
  assert.equal(admission!.row.holder_email, "prove@impronta.test");
  assert.equal(admission!.row.party_size, 3);
  assert.equal(admission!.row.admitted_count, 3, "seated in full, as check_in stamps an arrival");
  assert.equal(admission!.row.space_id, "s1");
  assert.equal(admission!.row.status, "valid");
  assert.ok(typeof admission!.row.seated_at === "string" && admission!.row.seated_at === admission!.row.starts_at);
  assert.equal(admission!.row.order_line_id, undefined, "a waiting party bought nothing");
});
