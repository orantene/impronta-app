import test from "node:test";
import assert from "node:assert/strict";

import { checkInAppointment, checkInVerdict } from "./checkin";

type Row = Record<string, unknown>;

function fakeAdmin(row: Row | null, onWrite: (filters: Array<[string, unknown]>, patch: Row) => Row[]) {
  const writes: Array<{ filters: Array<[string, unknown]>; patch: Row }> = [];
  const from = () => {
    const filters: Array<[string, unknown]> = [];
    let patch: Row | null = null;
    const api: Record<string, unknown> = {
      select: () => api,
      eq: (k: string, v: unknown) => {
        filters.push([k, v]);
        return api;
      },
      update: (p: Row) => {
        patch = p;
        return api;
      },
      maybeSingle: async () => ({ data: row, error: null }),
      then: (resolve: (v: { data: Row[]; error: null }) => unknown) => {
        const written = patch ?? {};
        writes.push({ filters, patch: written });
        return Promise.resolve({ data: onWrite(filters, written), error: null }).then(resolve);
      },
    };
    return api;
  };
  return { admin: { from }, writes };
}

test("the verdict: stale screen, already in, cancelled, completed, or fine", () => {
  assert.equal(checkInVerdict({ stored: "confirmed", expected: "tentative" }), "changed_since_opened");
  assert.equal(checkInVerdict({ stored: "in_progress", expected: "in_progress" }), "already_in");
  assert.equal(checkInVerdict({ stored: "cancelled", expected: "cancelled" }), "cancelled");
  assert.equal(checkInVerdict({ stored: "completed", expected: "completed" }), "completed");
  assert.equal(checkInVerdict({ stored: "archived", expected: "archived" }), "not_checkinable");
  assert.equal(checkInVerdict({ stored: "confirmed", expected: "confirmed" }), null);
  assert.equal(checkInVerdict({ stored: "tentative", expected: "tentative" }), null);
});

test("a check-in writes in_progress under the status the operator saw, tenant-scoped", async () => {
  const { admin, writes } = fakeAdmin({ id: "bk-1", status: "confirmed" }, () => [{ id: "bk-1" }]);
  const r = await checkInAppointment(admin as never, {
    tenantId: "t1",
    bookingId: "bk-1",
    expectedState: "confirmed",
    actorUserId: "u1",
  });
  assert.deepEqual(r, { ok: true, already: false });
  assert.equal(writes.length, 1);
  const write = writes[0]!;
  assert.equal(write.patch.status, "in_progress");
  assert.equal(write.patch.updated_by_staff_id, "u1");
  // The condition is in the statement: id, tenant AND the status seen.
  assert.deepEqual(
    write.filters,
    [
      ["id", "bk-1"],
      ["tenant_id", "t1"],
      ["status", "confirmed"],
    ],
  );
});

test("a colleague who got there between the read and the write turns the tap into a refusal", async () => {
  // The read still says confirmed; the conditional update matches no row.
  const { admin } = fakeAdmin({ id: "bk-1", status: "confirmed" }, () => []);
  const r = await checkInAppointment(admin as never, {
    tenantId: "t1",
    bookingId: "bk-1",
    expectedState: "confirmed",
    actorUserId: "u1",
  });
  assert.deepEqual(r, { ok: false, reason: "changed_since_opened" });
});

test("a cancelled booking is refused before any write; a missing one is not found", async () => {
  const cancelled = fakeAdmin({ id: "bk-1", status: "cancelled" }, () => {
    throw new Error("must not write");
  });
  assert.deepEqual(
    await checkInAppointment(cancelled.admin as never, { tenantId: "t1", bookingId: "bk-1", expectedState: "cancelled", actorUserId: "u1" }),
    { ok: false, reason: "cancelled" },
  );
  const missing = fakeAdmin(null, () => {
    throw new Error("must not write");
  });
  assert.deepEqual(
    await checkInAppointment(missing.admin as never, { tenantId: "t1", bookingId: "bk-x", expectedState: "confirmed", actorUserId: "u1" }),
    { ok: false, reason: "not_found" },
  );
});
