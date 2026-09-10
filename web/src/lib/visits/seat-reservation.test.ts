/**
 * Seating a held table has to close out the booking that was holding it.
 *
 * The failure this covers is silent and expensive: the floor said "occupied",
 * the desk went on saying "arriving", then "running late", and the grace job
 * could stamp a no-show — with a fee attached — on guests who were eating.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { markReservationSeated } from "./seat-reservation";

type Row = Record<string, unknown>;

/**
 * The same PostgREST double the rest of `lib/visits` uses, plus `rpc`. The RPC
 * is a REAL implementation of `check_in`'s contract, not a stub that always
 * says yes: the refusals this module maps (`already_admitted`, `not_valid`)
 * only exist because the function refuses, and a stub would let the mapping
 * rot without a test noticing.
 */
function fakeAdmin(admissions: Row[]) {
  const from = (table: string) => {
    assert.equal(table, "admissions");
    let mode: "select" | "update" = "select";
    let patch: Row = {};
    const preds: Array<(row: Row) => boolean> = [];
    const match = () => admissions.filter((row) => preds.every((p) => p(row)));
    const apply = () => {
      if (mode === "update") for (const row of match()) Object.assign(row, patch);
    };
    const api: Record<string, unknown> = {
      select: () => api,
      update: (p: Row) => {
        mode = "update";
        patch = p;
        return api;
      },
      eq: (k: string, v: unknown) => {
        preds.push((row) => row[k] === v);
        return api;
      },
      maybeSingle: async () => {
        apply();
        return { data: match()[0] ?? null, error: null };
      },
      then: (resolve: (v: { data: unknown; error: null }) => unknown) => {
        apply();
        return Promise.resolve({ data: match(), error: null }).then(resolve);
      },
    };
    return api;
  };

  const calls: Array<Record<string, unknown>> = [];
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    calls.push({ fn, ...args });
    if (fn !== "check_in") return { data: null, error: { message: `no function ${fn}` } };
    const row = admissions.find((a) => a.id === args.p_admission_id);
    if (!row) return { data: { ok: false, reason: "unknown_admission" }, error: null };
    if (row.status !== "valid") {
      return { data: { ok: false, reason: "not_valid", status: row.status }, error: null };
    }
    const partySize = Number(row.party_size);
    const admitted = Number(row.admitted_count);
    const remaining = partySize - admitted;
    if (remaining <= 0) {
      return {
        data: { ok: false, reason: "already_admitted", partySize, admittedCount: admitted, at: row.seated_at },
        error: null,
      };
    }
    const count = args.p_count == null ? remaining : Number(args.p_count);
    row.admitted_count = admitted + count;
    row.seated_at = row.seated_at ?? "2026-09-11T02:00:00.000Z";
    row.no_show_at = null;
    return {
      data: {
        ok: true,
        admitted: count,
        admittedCount: admitted + count,
        partySize,
        remaining: remaining - count,
      },
      error: null,
    };
  };

  return { admin: { from, rpc }, calls };
}

function booking(over: Row = {}): Row {
  return {
    id: "adm-1",
    tenant_id: "t1",
    space_id: "space-t7",
    status: "valid",
    party_size: 4,
    admitted_count: 0,
    seated_at: null,
    no_show_at: null,
    ...over,
  };
}

test("seating the held table admits the whole party through check_in", async () => {
  const rows = [booking()];
  const { admin, calls } = fakeAdmin(rows);
  const result = await markReservationSeated(admin, {
    tenantId: "t1",
    admissionId: "adm-1",
    spaceIds: ["space-t7"],
    actorUserId: "user-1",
  });
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.admittedCount, 4);
  // Read back through the row, not through the return value: a command that
  // reports success without the write landing is the failure mode.
  assert.equal(rows[0].admitted_count, 4);
  assert.ok(rows[0].seated_at);
  // The arithmetic went through the ONE authority, in actor mode, with no
  // token — a host tapped a card, there is no QR in this story.
  assert.equal(calls.length, 1);
  assert.equal(calls[0].fn, "check_in");
  assert.equal(calls[0].p_mode, "actor");
  assert.equal(calls[0].p_token_version, null);
  assert.equal(calls[0].p_actor, "user-1");
});

test("a booking from another workspace is not found, never admitted", async () => {
  const rows = [booking({ tenant_id: "t2" })];
  const { admin, calls } = fakeAdmin(rows);
  const result = await markReservationSeated(admin, {
    tenantId: "t1",
    admissionId: "adm-1",
    spaceIds: ["space-t7"],
    actorUserId: "user-1",
  });
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.reason, "reservation_not_found");
  // The RPC has no tenant predicate of its own: if this call were made, the
  // other workspace's guest would be marked as arrived.
  assert.equal(calls.length, 0);
  assert.equal(rows[0].admitted_count, 0);
});

test("a booking held for a different table is refused", async () => {
  const rows = [booking({ space_id: "space-t9" })];
  const { admin, calls } = fakeAdmin(rows);
  const result = await markReservationSeated(admin, {
    tenantId: "t1",
    admissionId: "adm-1",
    spaceIds: ["space-t7"],
    actorUserId: "user-1",
  });
  assert.equal(!result.ok && result.reason, "reservation_other_table");
  assert.equal(calls.length, 0);
});

test("a booking held for the JOINED half of a seating is fulfilled by it", async () => {
  // T15: two tables pushed together are one seating. A booking on either half
  // is the booking this seating fulfils.
  const rows = [booking({ space_id: "space-t8" })];
  const { admin } = fakeAdmin(rows);
  const result = await markReservationSeated(admin, {
    tenantId: "t1",
    admissionId: "adm-1",
    spaceIds: ["space-t7", "space-t8"],
    actorUserId: "user-1",
  });
  assert.equal(result.ok, true);
  assert.equal(rows[0].admitted_count, 4);
});

test("an unassigned booking is PLACED on the table it was seated at", async () => {
  // `space_id` null is a valid state — the host had not chosen a table yet.
  // Seating is the choice, and the desk must show the table afterwards.
  const rows = [booking({ space_id: null })];
  const { admin } = fakeAdmin(rows);
  const result = await markReservationSeated(admin, {
    tenantId: "t1",
    admissionId: "adm-1",
    spaceIds: ["space-t7", "space-t8"],
    actorUserId: null,
  });
  assert.equal(result.ok, true);
  assert.equal(rows[0].space_id, "space-t7");
});

test("a second seating of the same booking is refused, not silently a no-op", async () => {
  // `check_in` defaults the count to the remainder, so a second call would
  // admit ZERO and return success. A host would read that as "seated" for a
  // party that is not there, and the floor would be wrong about the room.
  const rows = [booking({ admitted_count: 4, seated_at: "2026-09-11T01:00:00.000Z" })];
  const { admin } = fakeAdmin(rows);
  const result = await markReservationSeated(admin, {
    tenantId: "t1",
    admissionId: "adm-1",
    spaceIds: ["space-t7"],
    actorUserId: "user-1",
  });
  assert.equal(!result.ok && result.reason, "reservation_already_seated");
});

test("a cancelled or refunded booking is refused with its own reason", async () => {
  for (const status of ["void", "refunded"]) {
    const rows = [booking({ status })];
    const { admin } = fakeAdmin(rows);
    const result = await markReservationSeated(admin, {
      tenantId: "t1",
      admissionId: "adm-1",
      spaceIds: ["space-t7"],
      actorUserId: "user-1",
    });
    assert.equal(!result.ok && result.reason, "reservation_not_valid", status);
  }
});

test("a read failure is unavailable, never a silent success", async () => {
  // PostgREST does not throw: a denied policy and a missing column both arrive
  // as `data: null` with an `error`. Dropping the error turns that into "no
  // such booking", which on this screen reads as "that guest is not coming".
  let rpcCalls = 0;
  const failing: Record<string, unknown> = {};
  failing.select = () => failing;
  failing.eq = () => failing;
  failing.maybeSingle = async () => ({ data: null, error: { message: "boom" } });
  const admin = {
    from: () => failing,
    rpc: async () => {
      rpcCalls += 1;
      return { data: null, error: null };
    },
  };
  const result = await markReservationSeated(admin, {
    tenantId: "t1",
    admissionId: "adm-1",
    spaceIds: ["space-t7"],
    actorUserId: null,
  });
  assert.equal(!result.ok && result.reason, "unavailable");
  assert.equal(rpcCalls, 0, "a failed scope read must never reach check_in");
});
